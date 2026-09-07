import { randomBytes } from 'crypto';
import type { IOrderRepository } from 'server/repositories/OrderRepository';
import type { IFulfillmentRepository, PurchaseInsertData } from 'server/repositories/FulfillmentRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { fulfillmentRepository } from 'server/repositories/FulfillmentRepository';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { requireOrderLineSnapshot } from 'server/domain/OrderEconomics';
import { ConflictError } from 'server/errors';
import { logger } from 'server/lib/logger';

/**
 * Fulfills a paid order by turning its immutable order lines into Purchase
 * rows and seller earnings credits. Every amount and the deliverable itself
 * come from the order line recorded at checkout — a later catalog edit or
 * payment-provider change cannot alter what gets paid or delivered.
 */
export class PurchaseFulfillmentService {
  constructor(
    private orders: IOrderRepository,
    private fulfillment: IFulfillmentRepository,
    private cloudinary: Pick<ICloudinaryService, 'tryGeneratePermanentPreviewUrl'>,
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

    // Each line's snapshot is the single source of truth for what was agreed
    // at checkout — see requireOrderLineSnapshot's own guard for why an
    // incomplete or non-conserving line refuses to pay anyone.
    const lines = order.items.map(requireOrderLineSnapshot);

    const purchaseData: PurchaseInsertData[] = [];
    const earningsMap = new Map<string, number>();

    for (const line of lines) {
      purchaseData.push({
        orderId,
        mediaItemId: line.mediaItemId,
        buyerId: order.buyerId,
        guestEmail: order.guestEmail,
        downloadToken: randomBytes(32).toString('hex'),
        amountPaid: line.unitAmountCents,
        platformFee: line.platformFeeAmount,
        photographerEarned: line.sellerEarningsAmount,
        previewUrl: this.cloudinary.tryGeneratePermanentPreviewUrl(line.deliverablePublicId),
      });
      earningsMap.set(
        line.sellerId,
        (earningsMap.get(line.sellerId) ?? 0) + line.sellerEarningsAmount,
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
  fulfillmentRepository,
  cloudinaryService,
);
