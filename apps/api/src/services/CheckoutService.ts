import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import type { IOrderRepository, OrderWithItems } from 'server/repositories/OrderRepository';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import type { IPurchaseRepository } from 'server/repositories/PurchaseRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { paymentAdapter } from 'server/providers/payment/activeAdapter';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { BadRequestError, BadGatewayError, ForbiddenError, ConflictError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { MEDIA_STATUS } from '@swelldays/contracts';
import { apiConfig } from 'server/config/env';

// A buyer plausibly needs up to this long to complete a CryptoCloud payment.
// Order has no expiresAt column to derive this from structurally, so the
// window is picked explicitly here. A PENDING order older than the window
// is not expired or transitioned — it simply stops being considered by the
// pending-order check below (see roadmap Non-goals: no reservation/expiry
// system).
const PENDING_ORDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export class CheckoutService {
  constructor(
    private orders: IOrderRepository,
    private media: IMediaRepository,
    private purchases: IPurchaseRepository,
    private payment: PaymentAdapter,
    private cloudinary: ICloudinaryService,
    private frontendOrigin: string,
  ) { }

  private async findCachedCheckoutSession(
    buyerId: string | null,
    clientRequestId: string,
  ): Promise<{ checkoutUrl: string; orderId: string } | null> {
    const existing = await this.orders.findOrderByBuyerAndClientRequestId(buyerId, clientRequestId);
    if (existing && existing.status === OrderStatus.PENDING && existing.checkoutSessionUrl) {
      return { checkoutUrl: existing.checkoutSessionUrl, orderId: existing.id };
    }
    return null;
  }

  /**
   * Price validation: prices are always read from DB — never from the client.
   * Items must be PUBLISHED and not already purchased by this buyer.
   */
  async createCheckoutSession(
    buyerId: string | null,
    guestEmail: string | undefined,
    itemIds: string[],
    clientRequestId: string,
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    const cached = await this.findCachedCheckoutSession(buyerId, clientRequestId);
    if (cached) return cached;

    const mediaItems = await this.fetchAndValidateCartItems(buyerId, itemIds);
    const totalCents = mediaItems.reduce((sum, item) => sum + (item.price ?? 0), 0);

    let order: Awaited<ReturnType<IOrderRepository['createOrder']>>;
    try {
      order = buyerId !== null
        ? await this.createOrderForBuyer(buyerId, guestEmail, itemIds, clientRequestId, totalCents)
        : await this.orders.createOrder({ buyerId, guestEmail, totalAmount: totalCents, itemIds, clientRequestId });
    } catch (err) {
      if (err instanceof ConflictError) {
        const raced = await this.findCachedCheckoutSession(buyerId, clientRequestId);
        if (raced) return raced;
      }
      throw err;
    }

    const checkoutUrl = await this.openPaymentSession(order.id, buyerId, mediaItems, totalCents);
    await this.orders.saveCheckoutSessionUrl(order.id, checkoutUrl);

    return { checkoutUrl, orderId: order.id };
  }

  async getPurchases(buyerId: string): Promise<{
    id: string;
    purchasedAt: Date;
    amountPaid: number;
    previewUrl: string | null;
    mediaItem: { id: string; thumbnailUrl: string };
  }[]> {
    const purchases = await this.purchases.findByBuyer(buyerId);

    // strip cloudinaryPublicId before sending to client
    return purchases.map((p) => ({
      id: p.id,
      purchasedAt: p.purchasedAt,
      amountPaid: p.amountPaid,
      previewUrl: p.previewUrl,
      mediaItem: {
        id: p.mediaItem.id,
        thumbnailUrl: p.mediaItem.thumbnailUrl,
      },
    }));
  }

  /**
   * Verifies the buyer owns the purchase, then generates a short-lived signed
   * Cloudinary download URL for the original media file.
   *
   * Throws ForbiddenError if no Purchase row exists for (buyerId, mediaItemId).
   */
  async generateDownloadAccess(
    buyerId: string,
    mediaItemId: string,
  ): Promise<{ downloadUrl: string; expiresAt: number }> {
    const purchase = await this.purchases.findByBuyerAndMedia(buyerId, mediaItemId);

    if (!purchase) throw new ForbiddenError('You have not purchased this item');

    const resourceType = purchase.mediaItem.type === 'VIDEO' ? 'video' : 'image';
    return this.cloudinary.generateSignedDownload(
      purchase.mediaItem.cloudinaryPublicId,
      resourceType,
    );
  }

  private async fetchAndValidateCartItems(buyerId: string | null, itemIds: string[]) {
    if (itemIds.length === 0) throw new BadRequestError('Cart is empty');

    const mediaItems = await this.media.findByIds(itemIds);

    if (mediaItems.length !== itemIds.length) {
      throw new BadRequestError('One or more items not found');
    }

    const unpublished = mediaItems.filter((m) => m.status !== MEDIA_STATUS.PUBLISHED);

    if (unpublished.length > 0) {
      throw new BadRequestError(
        `Some items are no longer available: ${unpublished.map((m) => m.id).join(', ')}`,
      );
    }

    const nullPriceItems = mediaItems.filter((m) => m.price === null);
    if (nullPriceItems.length > 0) {
      throw new BadRequestError(
        `Some items have no price set: ${nullPriceItems.map((m) => m.id).join(', ')}`,
      );
    }

    if (buyerId !== null) {
      const ownedItems = mediaItems.filter((m) => m.photographerId === buyerId);

      if (ownedItems.length > 0) {
        throw new BadRequestError('You cannot purchase your own media');
      }
    }

    return mediaItems;
  }

  /**
   * Creates the Order (+ its OrderItems) for an authenticated buyer inside one
   * DB transaction, serialized per-buyer via a Postgres advisory lock
   * (pg_advisory_xact_lock, scoped to hashtext(buyerId)). The lock and the
   * pending/purchased-item checks MUST run inside this same transaction as
   * the order INSERT — that's what closes P02a's own check-then-act race: a
   * second concurrent call blocks on the lock until the first commits, then
   * re-runs its check and now sees the first call's already-committed order.
   * The lock self-releases on commit or rollback — no cleanup path needed.
   *
   * This necessarily re-implements (rather than calls) OrderRepository's
   * findPendingMediaItemIds/createOrder and PurchaseRepository's
   * findPurchasedItemIds: those repository methods are bound to the
   * top-level prisma client, not this transaction's tx — calling them here
   * would silently run outside the lock's protection. See roadmap P02c.
   */
  private async createOrderForBuyer(
    buyerId: string,
    guestEmail: string | undefined,
    itemIds: string[],
    clientRequestId: string,
    totalAmount: number,
  ): Promise<OrderWithItems> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${buyerId}))`;

        const purchasedRows = await tx.purchase.findMany({
          where: { buyerId, mediaItemId: { in: itemIds } },
          select: { mediaItemId: true },
        });
        if (purchasedRows.length > 0) {
          throw new BadRequestError(
            `Some items already purchased: ${purchasedRows.map((r) => r.mediaItemId).join(', ')}`,
          );
        }

        const sinceCreatedAt = new Date(Date.now() - PENDING_ORDER_WINDOW_MS);
        const pendingRows = await tx.orderItem.findMany({
          where: {
            mediaItemId: { in: itemIds },
            order: { buyerId, status: OrderStatus.PENDING, createdAt: { gte: sinceCreatedAt } },
          },
          select: { mediaItemId: true },
        });
        if (pendingRows.length > 0) {
          throw new BadRequestError(
            `Some items already have a pending order: ${pendingRows.map((r) => r.mediaItemId).join(', ')}`,
          );
        }

        return tx.order.create({
          data: {
            buyerId,
            guestEmail,
            totalAmount,
            clientRequestId,
            items: { createMany: { data: itemIds.map((mediaItemId) => ({ mediaItemId })) } },
          },
          include: { items: { select: { id: true, mediaItemId: true } } },
        });
      })
    );
  }

  private async openPaymentSession(
    orderId: string,
    buyerId: string | null,
    mediaItems: { id: string }[],
    totalCents: number,
  ): Promise<string> {
    const successUrl = buyerId
      ? `${this.frontendOrigin}/me/collections/purchases?order=${orderId}`
      : `${this.frontendOrigin}/order-success?orderId=${orderId}`;

    try {
      const { checkoutUrl } = await this.payment.createCheckoutSession({
        orderId,
        totalCents,
        successUrl,
        failUrl: `${this.frontendOrigin}/cart`,
      });

      return checkoutUrl;
    } catch (err) {
      logger.error('[CheckoutService] Payment gateway error', { err, orderId });
      await this.orders.markOrderFailed(orderId);

      throw new BadGatewayError('Failed to create checkout session');
    }
  }
}

export const checkoutService = new CheckoutService(
  orderRepository,
  mediaRepository,
  purchaseRepository,
  paymentAdapter,
  cloudinaryService,
  apiConfig.frontendOrigin,
);
