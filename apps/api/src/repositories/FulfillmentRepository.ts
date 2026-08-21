import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
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
  externalOrderId: string;
  purchases: PurchaseInsertData[];
  earnings: EarningsEntry[];
};

export interface IFulfillmentRepository {
  commitFulfillment(payload: FulfillmentPayload): Promise<void>;
}

export class FulfillmentRepository implements IFulfillmentRepository {
  commitFulfillment(payload: FulfillmentPayload): Promise<void> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: payload.orderId },
          data: { status: OrderStatus.COMPLETED, externalOrderId: payload.externalOrderId },
        });

        await tx.purchase.createMany({ data: payload.purchases });

        await Promise.all(
          payload.earnings.map(({ photographerId, amount }) =>
            ledgerRepository.recordSale(tx, {
              photographerId,
              amount,
              externalOrderId: payload.externalOrderId,
            })
          )
        );
      })
    );
  }
}

export const fulfillmentRepository = new FulfillmentRepository();
