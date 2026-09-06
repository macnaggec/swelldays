import { randomBytes } from 'crypto';
import type { IOrderRepository } from 'server/repositories/OrderRepository';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import type { IFulfillmentRepository, PurchaseInsertData } from 'server/repositories/FulfillmentRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { fulfillmentRepository } from 'server/repositories/FulfillmentRepository';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { ConflictError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { apiConfig } from 'server/config/env';

const PLATFORM_FEE_RATE = 0.20;
const PHOTOGRAPHER_RATE = 0.80;

// Paddle is a merchant of record: VAT is extracted from the sticker price
// before it ever reaches the platform (passed through to tax authorities,
// not platform revenue), and Paddle additionally deducts its own processing
// fee (5% + $0.50) from what's left. A flat 20% cut of the sticker price
// doesn't account for either — on a cheap item the $0.50 alone can exceed
// the platform's entire flat-rate cut, putting the platform underwater on
// that sale once the photographer is paid 80% of the full sticker price.
// This mirrors Paddle's own fee shape (fixed + percentage) so the
// platform's cut always covers it, plus a 25% margin on top of that cost.
const PADDLE_PLATFORM_FEE_FIXED_CENTS = 50;
const PADDLE_PLATFORM_FEE_RATE = 0.30; // Paddle's 5% + 25% margin

function computeSplit(
  price: number,
  paymentProvider: string,
): { platformFee: number; photographerEarned: number } {
  if (paymentProvider === 'paddle') {
    const platformFee = Math.min(
      price,
      Math.round(PADDLE_PLATFORM_FEE_FIXED_CENTS + price * PADDLE_PLATFORM_FEE_RATE),
    );
    return { platformFee, photographerEarned: price - platformFee };
  }
  return {
    platformFee: Math.round(price * PLATFORM_FEE_RATE),
    photographerEarned: Math.round(price * PHOTOGRAPHER_RATE),
  };
}

export class PurchaseFulfillmentService {
  constructor(
    private orders: IOrderRepository,
    private media: IMediaRepository,
    private fulfillment: IFulfillmentRepository,
    private cloudinary: Pick<ICloudinaryService, 'tryGeneratePermanentPreviewUrl'>,
    private paymentProvider: string = 'mock',
  ) { }

  /**
   * Fulfills an order after payment confirmation.
   * Idempotent: exits early if externalOrderId already recorded.
   * P2002 (@@unique externalOrderId race) is caught via BaseRepository.run → mapPrismaError → ConflictError,
   * which callers treat as idempotent success.
   */
  async fulfillOrder(orderId: string, externalOrderId: string): Promise<void> {
    const existing = await this.orders.findOrderByExternalId(externalOrderId);
    if (existing) return;

    const order = await this.orders.findOrderById(orderId);
    if (!order) return;

    // itemIds come from OrderItem rows — not trusted from the external webhook payload
    const itemIds = order.items.map((item) => item.mediaItemId);
    const mediaItems = await this.media.findByIdsForFulfillment(itemIds);
    const availableIds = new Set(mediaItems.map((item) => item.id));
    const unavailableIds = itemIds.filter((itemId) => !availableIds.has(itemId));

    if (unavailableIds.length > 0) {
      throw new Error(`Order contains unavailable media items: ${unavailableIds.join(', ')}`);
    }

    const purchaseData: PurchaseInsertData[] = [];
    const earningsMap = new Map<string, number>();

    for (const item of mediaItems) {
      const { platformFee, photographerEarned } = computeSplit(item.price, this.paymentProvider);

      purchaseData.push({
        orderId,
        mediaItemId: item.id,
        buyerId: order.buyerId,
        guestEmail: order.guestEmail,
        downloadToken: randomBytes(32).toString('hex'),
        amountPaid: item.price,
        platformFee,
        photographerEarned,
        previewUrl: this.cloudinary.tryGeneratePermanentPreviewUrl(item.cloudinaryPublicId),
      });
      earningsMap.set(
        item.photographerId,
        (earningsMap.get(item.photographerId) ?? 0) + photographerEarned,
      );
    }

    try {
      const result = await this.fulfillment.commitFulfillment({
        orderId,
        externalOrderId,
        purchases: purchaseData,
        earnings: Array.from(earningsMap, ([photographerId, amount]) => ({ photographerId, amount })),
      });
      if (!result.applied) return; // order already left PENDING — idempotent no-op, same as the ConflictError branch below
      if (result.skippedMediaItemIds.length > 0) {
        logger.warn('[PurchaseFulfillmentService] Skipped duplicate Purchase insert(s) on (buyerId, mediaItemId)', {
          orderId,
          mediaItemIds: result.skippedMediaItemIds,
        });
      }
    } catch (err) {
      // P2002 on externalOrderId unique constraint — concurrent webhook delivered the same event
      if (err instanceof ConflictError) return;
      throw err;
    }
  }
}

export const purchaseFulfillmentService = new PurchaseFulfillmentService(
  orderRepository,
  mediaRepository,
  fulfillmentRepository,
  cloudinaryService,
  apiConfig.payment.provider,
);
