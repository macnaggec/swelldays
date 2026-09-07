import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { acquireSerializationLock, fulfillmentScope, withTransactionRetry } from 'server/lib/TransactionSerialization';
import { ledgerRepository } from 'server/repositories/LedgerRepository';

export type FulfillPurchaseData = {
  mediaItemId: string;
  buyerId: string | null;
  guestEmail?: string | null;
  downloadToken: string;
  amountPaid: number;
  platformFee: number;
  photographerEarned: number;
  previewUrl: string | null;
};

export type PurchaseInsertData = FulfillPurchaseData & { orderId: string };

export type EarningsEntry = {
  photographerId: string;
  amount: number;
};

export type FulfillmentPayload = {
  orderId: string;
  /** Whose entitlement this fulfillment serializes against; null for a guest order. */
  buyerId: string | null;
  externalOrderId: string;
  purchases: PurchaseInsertData[];
  earnings: EarningsEntry[];
};

export type CommitFulfillmentResult =
  | { applied: false }
  | { applied: true; skippedMediaItemIds: string[] };

export interface IFulfillmentRepository {
  commitFulfillment(payload: FulfillmentPayload): Promise<CommitFulfillmentResult>;
}

export class FulfillmentRepository implements IFulfillmentRepository {
  /**
   * Lock order, documented once and followed everywhere it applies:
   * 1. the buyer (or, for a guest order, the order) advisory lock;
   * 2. the order row, via the conditional PENDING claim below;
   * 3. seller balance rows, ascending by photographerId.
   */
  commitFulfillment(payload: FulfillmentPayload): Promise<CommitFulfillmentResult> {
    return runQuery(() =>
      withTransactionRetry(() =>
        prisma.$transaction(async (tx) => {
          await acquireSerializationLock(tx, fulfillmentScope(payload.buyerId, payload.orderId));

          const { count } = await tx.order.updateMany({
            where: { id: payload.orderId, status: OrderStatus.PENDING },
            data: { status: OrderStatus.COMPLETED, externalOrderId: payload.externalOrderId },
          });
          if (count === 0) {
            // Order already left PENDING — a concurrent commitFulfillment for the
            // same orderId/externalOrderId won this race. Skip the rest of the
            // transaction: writing Purchase/ledger rows again would double them,
            // since Purchase has no uniqueness constraint yet (see roadmap P02b).
            return { applied: false };
          }

          const { count: insertedCount } = await tx.purchase.createMany({
            data: payload.purchases,
            skipDuplicates: true,
          });

          let skippedMediaItemIds: string[] = [];
          if (insertedCount < payload.purchases.length) {
            const inserted = await tx.purchase.findMany({
              where: { orderId: payload.orderId },
              select: { mediaItemId: true },
            });
            const insertedIds = new Set(inserted.map((p) => p.mediaItemId));
            skippedMediaItemIds = payload.purchases
              .map((p) => p.mediaItemId)
              .filter((mediaItemId) => !insertedIds.has(mediaItemId));
          }

          // Sequential, ascending-by-photographerId: two concurrent
          // fulfillments touching the same two sellers in opposite order can
          // deadlock on the seller balance rows; a fixed ascending order
          // removes the cycle. This is step 3 of the documented lock order.
          const orderedEarnings = [...payload.earnings].sort(
            (a, b) => a.photographerId.localeCompare(b.photographerId),
          );
          for (const { photographerId, amount } of orderedEarnings) {
            await ledgerRepository.recordSale(tx, { photographerId, amount, externalOrderId: payload.externalOrderId });
          }

          return { applied: true, skippedMediaItemIds };
        })
      )
    );
  }
}

export const fulfillmentRepository = new FulfillmentRepository();
