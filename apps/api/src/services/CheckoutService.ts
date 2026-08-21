import type { IOrderRepository } from 'server/repositories/OrderRepository';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import type { IPurchaseRepository } from 'server/repositories/PurchaseRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { paymentAdapter } from 'server/providers/payment/activeAdapter';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { BadRequestError, BadGatewayError, ForbiddenError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { MEDIA_STATUS } from '@swelldays/contracts';
import { apiConfig } from 'server/config/env';

export class CheckoutService {
  constructor(
    private orders: IOrderRepository,
    private media: IMediaRepository,
    private purchases: IPurchaseRepository,
    private payment: PaymentAdapter,
    private cloudinary: ICloudinaryService,
    private frontendOrigin: string,
  ) { }

  /**
   * Price validation: prices are always read from DB — never from the client.
   * Items must be PUBLISHED and not already purchased by this buyer.
   */
  async createCheckoutSession(
    buyerId: string | null,
    guestEmail: string | undefined,
    itemIds: string[],
  ): Promise<{ checkoutUrl: string; orderId: string }> {
    const mediaItems = await this.fetchAndValidateCartItems(buyerId, itemIds);
    const totalCents = mediaItems.reduce((sum, item) => sum + (item.price ?? 0), 0);

    const order = await this.orders.createOrder({
      buyerId,
      guestEmail,
      totalAmount: totalCents,
      itemIds
    });

    const checkoutUrl = await this.openPaymentSession(
      order.id,
      buyerId,
      mediaItems,
      totalCents
    );

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

      const purchasedIds = await this.purchases.findPurchasedItemIds(buyerId, itemIds);

      if (purchasedIds.length > 0) {
        throw new BadRequestError(
          `Some items already purchased: ${purchasedIds.join(', ')}`,
        );
      }
    }

    return mediaItems;
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
