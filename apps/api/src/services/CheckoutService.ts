import { OrderStatus, PaymentAttemptCreationState } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import type { IOrderRepository, OrderWithItems } from 'server/repositories/OrderRepository';
import type { IMediaRepository, MediaCheckoutReadClient } from 'server/repositories/MediaRepository';
import type { IPurchaseRepository } from 'server/repositories/PurchaseRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import type { IPaymentService } from 'server/services/PaymentService';
import type { PaymentCheckoutOutcome } from 'server/services/PaymentService';
import { paymentService } from 'server/services/PaymentService';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { BadRequestError, BadGatewayError, ForbiddenError, ConflictError, ServiceUnavailableError } from 'server/errors';
import { acquireSerializationLock, buyerScope, withTransactionRetry } from 'server/lib/TransactionSerialization';
import { MEDIA_STATUS } from '@swelldays/contracts/core';
import { apiConfig } from 'server/config/env';
import type { OrderLineSnapshot, PaymentProvider, PricedCheckoutCatalogItem } from 'server/domain/OrderEconomics';
import { snapshotOrderLine } from 'server/domain/OrderEconomics';

const RACED_ORDER_RETRY_ATTEMPTS = 3;
const RACED_ORDER_RETRY_DELAY_MS = 250; // ms

function itemSetsMatch(orderItems: { mediaItemId: string }[], itemIds: string[]): boolean {
  const orderItemIds = new Set(orderItems.map((item) => item.mediaItemId));
  const requestedItemIds = new Set(itemIds);
  return orderItemIds.size === requestedItemIds.size
    && [...orderItemIds].every((id) => requestedItemIds.has(id));
}

export class CheckoutService {
  constructor(
    private orders: IOrderRepository,
    private media: IMediaRepository,
    private purchases: IPurchaseRepository,
    private payment: Pick<IPaymentService, 'prepareAttempt' | 'openPreparedAttempt' | 'resumeAttempt'>,
    private cloudinary: ICloudinaryService,
    private frontendOrigin: string,
    private paymentProvider: PaymentProvider,
  ) { }

  /**
   * Looks up any existing order under this (buyerId, clientRequestId). If one
   * exists but its items don't match the current request's itemIds, the key
   * has been reused for different content — reject rather than silently
   * returning a checkout session for the wrong cart (same "don't trust the
   * client" posture as the price validation below — applied to idempotency
   * keys, not just prices; see roadmap P05).
   */
  private async findCachedOrder(
    buyerId: string | null,
    clientRequestId: string,
    itemIds: string[],
  ): Promise<OrderWithItems | null> {
    const existing = await this.orders.findOrderByBuyerAndClientRequestId(buyerId, clientRequestId);
    if (!existing) return null;

    if (!itemSetsMatch(existing.items, itemIds)) {
      throw new BadRequestError(
        'This request\'s idempotency key was already used for a different set of items — please retry with a new request.',
      );
    }

    return existing;
  }

  /**
   * Called when createOrderForBuyer's/createOrder's unique-constraint INSERT
   * lost a race against a concurrent call under the same (buyerId,
   * clientRequestId) — the winner's Order row already exists (that's why we
   * got ConflictError here), but its prepared PaymentAttempt may still be in
   * the short creation lease. Poll briefly for the winner to finish instead of surfacing the raw ConflictError for what
   * should be a transparently deduplicated request (AD2/roadmap P04).
   *
   * If the winning order is FAILED, that's a real terminal failure under this
   * key — per AD2, idempotency keys are permanent, so the caller needs a fresh
   * clientRequestId to retry, not a silent infinite retry.
   *
   * Also rejects if the polled order's items don't match this request's
   * itemIds, for the same reason and with the same error as
   * findCachedCheckoutSession (see roadmap P05).
   */
  private async resolveRacedCheckoutSession(
    buyerId: string | null,
    clientRequestId: string,
    itemIds: string[],
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    for (let attempt = 0; attempt < RACED_ORDER_RETRY_ATTEMPTS; attempt++) {
      const order = await this.orders.findOrderByBuyerAndClientRequestId(buyerId, clientRequestId);

      if (order && !itemSetsMatch(order.items, itemIds)) {
        throw new BadRequestError(
          'This request\'s idempotency key was already used for a different set of items — please retry with a new request.',
        );
      }
      if (order !== null) {
        const outcome = await this.payment.resumeAttempt(order.id);
        if (outcome.type !== 'creating') {
          return this.requireCheckoutUrl(order.id, outcome);
        }
      }

      if (attempt < RACED_ORDER_RETRY_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, RACED_ORDER_RETRY_DELAY_MS));
      }
    }

    throw new ServiceUnavailableError(
      'This checkout attempt is still being created — please wait a moment and retry.',
    );
  }

  /**
   * Price validation: prices are always read from DB — never from the client.
   * Items must be PUBLISHED and not already purchased by this buyer.
   *
   * openPaymentSession's provider network call happens after this method's
   * order-creation transaction has already committed and released its lock —
   * deliberately, since a lock must never be held across a network call.
   */
  async createCheckoutSession(
    buyerId: string | null,
    guestEmail: string | undefined,
    itemIds: string[],
    clientRequestId: string,
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    const cached = await this.findCachedOrder(buyerId, clientRequestId, itemIds);
    if (cached) {
      return this.requireCheckoutUrl(cached.id, await this.payment.resumeAttempt(cached.id));
    }

    let prepared: Awaited<ReturnType<CheckoutService['createOrderForBuyer']>>;
    try {
      prepared = buyerId !== null
        ? await this.createOrderForBuyer(buyerId, guestEmail, itemIds, clientRequestId)
        : await this.createOrderForGuest(guestEmail, itemIds, clientRequestId);
    } catch (err) {
      if (err instanceof ConflictError) {
        return await this.resolveRacedCheckoutSession(buyerId, clientRequestId, itemIds);
      }
      throw err;
    }

    return this.openPaymentSession(
      prepared.order.id,
      prepared.attempt.id,
      buyerId,
    );
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

  private async snapshotCartLines(
    buyerId: string | null,
    itemIds: string[],
    db?: MediaCheckoutReadClient,
  ): Promise<OrderLineSnapshot[]> {
    if (itemIds.length === 0) throw new BadRequestError('Cart is empty');

    const mediaItems = await this.media.findByIdsForCheckout(itemIds, db);

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

    const priced = mediaItems.filter((m): m is PricedCheckoutCatalogItem => m.price !== null);

    return priced.map((item) => snapshotOrderLine(item, this.paymentProvider));
  }

  /**
   * Creates the Order (+ its OrderItems) for an authenticated buyer inside one
   * DB transaction, serialized per-buyer via the shared advisory-lock
   * protocol in server/lib/TransactionSerialization (acquireSerializationLock
   * / buyerScope). The lock and the pending/purchased-item checks MUST run
   * inside this same transaction as the order INSERT — that's what closes
   * P02a's own check-then-act race: a second concurrent call blocks on the
   * lock until the first commits, then re-runs its check and now sees the
   * first call's already-committed order. The lock self-releases on commit
   * or rollback — no cleanup path needed.
   *
   * Documented lock order (see TransactionSerialization): 1) the buyer (or,
   * for a guest order, the order) advisory lock; 2) the order row, via the
   * conditional PENDING claim; 3) seller balance rows, ascending by
   * photographerId. FulfillmentRepository.commitFulfillment now takes the
   * same buyer-scoped lock, which is what closes CON-02's cross-snapshot gap:
   * checkout and fulfillment can no longer read their two checks on different
   * PostgreSQL snapshots of the same buyer's purchases.
   *
   * createOrder and findByIdsForCheckout accept this transaction's client, so
   * the catalog read, the snapshot, and the order INSERT all commit under the
   * one buyer lock.
   */
  private async createOrderForBuyer(
    buyerId: string,
    guestEmail: string | undefined,
    itemIds: string[],
    clientRequestId: string,
  ): Promise<{
    order: OrderWithItems;
    attempt: Awaited<ReturnType<IPaymentService['prepareAttempt']>>;
  }> {
    return runQuery(() =>
      withTransactionRetry(() =>
        prisma.$transaction(async (tx) => {
          await acquireSerializationLock(tx, buyerScope(buyerId));

          const purchasedRows = await tx.purchase.findMany({
            where: { buyerId, mediaItemId: { in: itemIds } },
            select: { mediaItemId: true },
          });
          if (purchasedRows.length > 0) {
            throw new BadRequestError(
              `Some items already purchased: ${purchasedRows.map((r) => r.mediaItemId).join(', ')}`,
            );
          }

          const pendingRows = await tx.orderItem.findMany({
            where: {
              mediaItemId: { in: itemIds },
              order: {
                buyerId,
                status: OrderStatus.PENDING,
                // Exclude this same clientRequestId: a same-key resubmission (e.g. a
                // double-click) is the identical logical attempt, not a different
                // pending order — it must fall through to the unique-constraint
                // ConflictError path (resolveRacedCheckoutSession) below, not be
                // misreported here as a pending-item conflict. See roadmap P04.
                clientRequestId: { not: clientRequestId },
              },
            },
            select: {
              mediaItemId: true,
              order: {
                select: {
                  paymentAttempts: {
                    orderBy: { createdAt: 'asc' },
                    take: 2,
                    select: {
                      creationState: true,
                      environment: true,
                      providerTransactionId: true,
                      checkoutUrl: true,
                      expiresAt: true,
                    },
                  },
                },
              },
            },
          });
          const blockingRows = pendingRows.filter((row) => isPendingPaymentBlocking(
            row.order.paymentAttempts,
            new Date(),
          ));
          if (blockingRows.length > 0) {
            throw new BadRequestError(
              `Some items already have a pending order: ${blockingRows.map((r) => r.mediaItemId).join(', ')}`,
            );
          }

          const items = await this.snapshotCartLines(buyerId, itemIds, tx);
          const order = await this.orders.createOrder({ buyerId, guestEmail, clientRequestId, items }, tx);
          const attempt = await this.payment.prepareAttempt({
            orderId: order.id,
            totalCents: order.totalAmount,
          }, tx);
          return { order, attempt };
        })
      )
    );
  }

  private async createOrderForGuest(
    guestEmail: string | undefined,
    itemIds: string[],
    clientRequestId: string,
  ): Promise<{
    order: OrderWithItems;
    attempt: Awaited<ReturnType<IPaymentService['prepareAttempt']>>;
  }> {
    return runQuery(() => prisma.$transaction(async (tx) => {
      const items = await this.snapshotCartLines(null, itemIds, tx);
      const order = await this.orders.createOrder({
        buyerId: null,
        guestEmail,
        clientRequestId,
        items,
      }, tx);
      const attempt = await this.payment.prepareAttempt({
        orderId: order.id,
        totalCents: order.totalAmount,
      }, tx);
      return { order, attempt };
    }));
  }

  private async openPaymentSession(
    orderId: string,
    attemptId: string,
    buyerId: string | null,
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    const successUrl = buyerId
      ? `${this.frontendOrigin}/me/collections/purchases?order=${orderId}`
      : `${this.frontendOrigin}/order-success?orderId=${orderId}`;

    const outcome = await this.payment.openPreparedAttempt({
      attemptId,
      successUrl,
      failUrl: `${this.frontendOrigin}/cart`,
    });
    return this.requireCheckoutUrl(orderId, outcome);
  }

  private async requireCheckoutUrl(
    orderId: string,
    outcome: PaymentCheckoutOutcome,
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    if (outcome.type === 'ready') return { checkoutUrl: outcome.checkoutUrl, orderId };
    if (outcome.type === 'definitively-failed') {
      await this.orders.markOrderFailed(orderId);
      throw new BadGatewayError('Failed to create checkout session; retry with a new request');
    }
    if (outcome.type === 'payment-received') {
      throw new ServiceUnavailableError('Payment received and is being processed');
    }
    if (outcome.type === 'creating') {
      throw new ServiceUnavailableError('Checkout session is still being created');
    }
    throw new ServiceUnavailableError('Checkout session outcome is unknown; retry later');
  }
}

type PendingPaymentAttempt = {
  creationState: PaymentAttemptCreationState;
  environment: unknown | null;
  providerTransactionId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
};

function isPendingPaymentBlocking(attempts: PendingPaymentAttempt[], now: Date): boolean {
  if (attempts.length !== 1) return true;
  const attempt = attempts[0]!;
  const bound = attempt.environment !== null
    && attempt.providerTransactionId !== null
    && attempt.checkoutUrl !== null;
  const state = attempt.creationState === PaymentAttemptCreationState.CREATING && bound
    ? PaymentAttemptCreationState.READY
    : attempt.creationState;
  if (state === PaymentAttemptCreationState.DEFINITIVELY_FAILED) return false;
  return !(state === PaymentAttemptCreationState.READY
    && bound
    && attempt.expiresAt !== null
    && attempt.expiresAt.getTime() <= now.getTime());
}

export const checkoutService = new CheckoutService(
  orderRepository,
  mediaRepository,
  purchaseRepository,
  paymentService,
  cloudinaryService,
  apiConfig.frontendOrigin,
  apiConfig.payment.provider,
);
