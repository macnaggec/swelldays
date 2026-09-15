import { randomBytes } from 'crypto';
import type { IOrderRepository } from 'server/repositories/OrderRepository';
import type { IFulfillmentRepository, PaidLineCandidate } from 'server/repositories/FulfillmentRepository';
import { orderRepository } from 'server/repositories/OrderRepository';
import { fulfillmentRepository } from 'server/repositories/FulfillmentRepository';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { cloudinaryService } from 'server/services/CloudinaryService';
import { requireOrderLineSnapshot } from 'server/domain/OrderEconomics';
import { ConflictError } from 'server/errors';

export type FulfillmentOutcome =
  | { type: 'fulfilled'; paidLineIds: string[] }
  | { type: 'fulfilled-with-exceptions'; paidLineIds: string[] }
  | { type: 'completed-duplicate' }
  | { type: 'unknown-order' }
  | { type: 'order-not-pending' };

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
  async fulfillOrder(orderId: string, externalOrderId: string, paymentAttemptId: string): Promise<FulfillmentOutcome> {
    const existing = await this.orders.findOrderByExternalId(externalOrderId);
    if (existing) return { type: 'completed-duplicate' };

    const order = await this.orders.findOrderById(orderId);
    if (!order) return { type: 'unknown-order' };

    // Each line's snapshot is the single source of truth for what was agreed
    // at checkout — see requireOrderLineSnapshot's own guard for why an
    // incomplete or non-conserving line refuses to pay anyone.
    const lines = order.items.map(requireOrderLineSnapshot);

    const paidLines: PaidLineCandidate[] = [];

    for (const line of lines) {
      paidLines.push({
        orderItemId: line.id,
        mediaItemId: line.mediaItemId,
        sellerId: line.sellerId,
        buyerId: order.buyerId,
        guestEmail: order.guestEmail,
        downloadToken: randomBytes(32).toString('hex'),
        amountPaid: line.unitAmountCents,
        platformFee: line.platformFeeAmount,
        sellerEarnings: line.sellerEarningsAmount,
        currency: line.currency,
        deliverablePublicId: line.deliverablePublicId,
        deliverableType: line.deliverableType,
        previewUrl: this.cloudinary.tryGeneratePermanentPreviewUrl(line.deliverablePublicId),
      });
    }

    try {
      const result = await this.fulfillment.commitFulfillment({
        orderId,
        paymentAttemptId,
        buyerId: order.buyerId,
        externalOrderId,
        paidLines,
      });
      if (!result.applied) return { type: 'order-not-pending' };
      return result.hasExceptions
        ? { type: 'fulfilled-with-exceptions', paidLineIds: result.paidLineIds }
        : { type: 'fulfilled', paidLineIds: result.paidLineIds };
    } catch (err) {
      // P2002 on externalOrderId unique constraint — concurrent webhook delivered the same event
      if (err instanceof ConflictError) return { type: 'completed-duplicate' };
      throw err;
    }
  }
}

export const purchaseFulfillmentService = new PurchaseFulfillmentService(
  orderRepository,
  fulfillmentRepository,
  cloudinaryService,
);
