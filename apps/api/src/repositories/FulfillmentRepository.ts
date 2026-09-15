import { OrderStatus, PaidOrderLineDeliveryStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import {
  acquireActiveAccountLocks,
  acquireSerializationLock,
  fulfillmentScope,
  withTransactionRetry,
} from 'server/lib/TransactionSerialization';
import { ledgerRepository } from 'server/repositories/LedgerRepository';

export type PaidLineCandidate = {
  orderItemId: string; mediaItemId: string; sellerId: string;
  buyerId: string | null; guestEmail: string | null; downloadToken: string;
  amountPaid: number; platformFee: number; sellerEarnings: number; currency: string;
  deliverablePublicId: string; deliverableType: 'PHOTO' | 'VIDEO'; previewUrl: string | null;
};
export type FulfillmentPayload = {
  orderId: string; paymentAttemptId: string; buyerId: string | null;
  externalOrderId: string; paidLines: PaidLineCandidate[];
};
export type CommitFulfillmentResult =
  | { applied: false }
  | { applied: true; paidLineIds: string[]; hasExceptions: boolean };
export interface IFulfillmentRepository {
  commitFulfillment(payload: FulfillmentPayload): Promise<CommitFulfillmentResult>;
}

export class FulfillmentRepository implements IFulfillmentRepository {
  commitFulfillment(payload: FulfillmentPayload): Promise<CommitFulfillmentResult> {
    return runQuery(() => withTransactionRetry(() => prisma.$transaction(async (tx) => {
      await acquireSerializationLock(tx, fulfillmentScope(payload.buyerId, payload.orderId));
      await acquireActiveAccountLocks(tx, payload.paidLines.map((line) => line.sellerId));
      const claimed = await tx.order.updateMany({
        where: { id: payload.orderId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.COMPLETED, externalOrderId: payload.externalOrderId },
      });
      if (claimed.count === 0) return { applied: false };
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: payload.paymentAttemptId },
        select: { orderId: true, expectedAmountCents: true, expectedCurrency: true } });
      if (attempt?.orderId !== payload.orderId) throw new Error('Payment attempt does not belong to fulfillment order');
      const order = await tx.order.findUniqueOrThrow({ where: { id: payload.orderId }, select: {
        buyerId: true, guestEmail: true, totalAmount: true, items: { select: {
          id: true, mediaItemId: true, sellerId: true, unitAmountCents: true, currency: true,
          platformFeeAmount: true, sellerEarningsAmount: true, deliverablePublicId: true, deliverableType: true,
        } },
      } });
      const candidates = new Map(payload.paidLines.map((line) => [line.orderItemId, line]));
      if (candidates.size !== payload.paidLines.length || order.items.length !== payload.paidLines.length
        || order.buyerId !== payload.buyerId || attempt.expectedAmountCents !== order.totalAmount
        || payload.paidLines.reduce((sum, line) => sum + line.amountPaid, 0) !== order.totalAmount
        || payload.paidLines.some((line) => line.currency !== attempt.expectedCurrency
          || line.buyerId !== order.buyerId || line.guestEmail !== order.guestEmail)
        || order.items.some((item) => {
          const line = candidates.get(item.id);
          return line === undefined || line.mediaItemId !== item.mediaItemId || line.sellerId !== item.sellerId
            || line.amountPaid !== item.unitAmountCents || line.currency !== item.currency
            || line.platformFee !== item.platformFeeAmount || line.sellerEarnings !== item.sellerEarningsAmount
            || line.deliverablePublicId !== item.deliverablePublicId || line.deliverableType !== item.deliverableType;
        })) {
        throw new Error('Fulfillment payload does not match immutable order economics');
      }
      const paidLineIds: string[] = [];
      let hasExceptions = false;
      for (const line of [...payload.paidLines].sort((a, b) => a.sellerId.localeCompare(b.sellerId))) {
        const entitlement = await tx.purchase.findFirst({ where: {
          revokedAt: null,
          mediaItemId: line.mediaItemId,
          ...(line.buyerId === null ? { buyerId: null, guestEmail: line.guestEmail } : { buyerId: line.buyerId }),
        } });
        const shared = {
          paymentAttemptId: payload.paymentAttemptId, orderItemId: line.orderItemId,
          orderId: payload.orderId, mediaItemId: line.mediaItemId, sellerId: line.sellerId,
          buyerId: line.buyerId, guestEmail: line.guestEmail, amountPaid: line.amountPaid,
          platformFee: line.platformFee, sellerEarnings: line.sellerEarnings, currency: line.currency,
          deliverablePublicId: line.deliverablePublicId, deliverableType: line.deliverableType,
        };
        if (entitlement !== null) {
          const paidLine = await tx.paidOrderLine.create({ data: { ...shared,
            deliveryStatus: PaidOrderLineDeliveryStatus.COMPENSATION_REQUIRED,
            exceptionReason: 'duplicate-entitlement' } });
          paidLineIds.push(paidLine.id); hasExceptions = true; continue;
        }
        const purchase = await tx.purchase.create({ data: {
          orderId: payload.orderId, mediaItemId: line.mediaItemId, buyerId: line.buyerId,
          guestEmail: line.guestEmail, downloadToken: line.downloadToken, amountPaid: line.amountPaid,
          platformFee: line.platformFee, photographerEarned: line.sellerEarnings, previewUrl: line.previewUrl,
        } });
        const paidLine = await tx.paidOrderLine.create({ data: { ...shared,
          deliveryStatus: PaidOrderLineDeliveryStatus.DELIVERED, purchaseId: purchase.id } });
        paidLineIds.push(paidLine.id);
        await ledgerRepository.recordSale(tx, { photographerId: line.sellerId, amount: line.sellerEarnings,
          externalOrderId: payload.externalOrderId, paidOrderLineId: paidLine.id });
      }
      return { applied: true, paidLineIds, hasExceptions };
    })));
  }
}
export const fulfillmentRepository = new FulfillmentRepository();
