import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from 'server/db';
import type { OrderLineSnapshot } from 'server/domain/OrderEconomics';
import type { PaymentReceipt } from 'server/domain/PaymentReceipt';
import { acquireSerializationLock, buyerScope, withTransactionRetry } from 'server/lib/TransactionSerialization';

const orderLineSchema = z.object({
  mediaItemId: z.string(),
  unitAmountCents: z.number().int().nonnegative(),
  currency: z.literal('USD'),
  sellerId: z.string(),
  feePolicyVersion: z.enum(['standard-20-v1', 'paddle-50c-30-v1']),
  platformFeeAmount: z.number().int().nonnegative(),
  sellerEarningsAmount: z.number().int().nonnegative(),
  deliverablePublicId: z.string(),
  deliverableType: z.enum(['PHOTO', 'VIDEO']),
});

const checkoutRevisionSchema = z.object({
  clientRequestId: z.string(),
  items: z.array(orderLineSchema).min(1),
});

export type CheckoutRevision = {
  clientRequestId: string;
  items: OrderLineSnapshot[];
};

export function checkoutRevisionJson(revision: CheckoutRevision): Prisma.InputJsonValue {
  return revision as unknown as Prisma.InputJsonValue;
}

export function parseCheckoutRevision(value: Prisma.JsonValue | null): CheckoutRevision | null {
  if (value === null) return null;
  const parsed = checkoutRevisionSchema.safeParse(value);
  if (!parsed.success) throw new Error('Order has an invalid pending checkout revision');
  return parsed.data as CheckoutRevision;
}

function revisionTotal(revision: CheckoutRevision): number {
  return revision.items.reduce((sum, item) => sum + item.unitAmountCents, 0);
}

async function applyRevision(
  tx: Prisma.TransactionClient,
  orderId: string,
  revision: CheckoutRevision,
): Promise<void> {
  const totalAmount = revisionTotal(revision);
  await tx.order.update({
    where: { id: orderId },
    data: {
      clientRequestId: revision.clientRequestId,
      totalAmount,
      pendingRevision: Prisma.DbNull,
      items: {
        deleteMany: {},
        createMany: { data: revision.items },
      },
    },
  });
  await tx.paymentAttempt.updateMany({
    where: { orderId },
    data: { expectedAmountCents: totalAmount },
  });
}

export async function finalizeCheckoutRevision(
  orderId: string,
  expectedClientRequestId: string,
): Promise<boolean> {
  return withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true, status: true, pendingRevision: true },
    });
    if (order?.buyerId === null || order === null) return false;
    await acquireSerializationLock(tx, buyerScope(order.buyerId));
    const locked = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, clientRequestId: true, pendingRevision: true },
    });
    const revision = parseCheckoutRevision(locked.pendingRevision);
    if (revision === null) {
      // A paid webhook may have committed this exact revision and fulfilled
      // the order while the PATCH response was travelling back to checkout.
      return locked.clientRequestId === expectedClientRequestId;
    }
    if (locked.status !== OrderStatus.PENDING
      || revision.clientRequestId !== expectedClientRequestId) return false;
    await applyRevision(tx, orderId, revision);
    return true;
  }));
}

/**
 * A paid receipt decides a staged revision authoritatively. If Paddle charged
 * the expanded total, commit the new snapshots before fulfillment reads them;
 * if it charged the old total, discard the revision and fulfill the old order.
 */
export async function resolveCheckoutRevisionForReceipt(
  orderId: string,
  receipt: PaymentReceipt,
): Promise<void> {
  await withTransactionRetry(() => prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { buyerId: true },
    });
    if (order?.buyerId === null || order === null) return;
    await acquireSerializationLock(tx, buyerScope(order.buyerId));
    const locked = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, pendingRevision: true },
    });
    if (locked.status !== OrderStatus.PENDING) return;
    const revision = parseCheckoutRevision(locked.pendingRevision);
    if (revision === null) return;

    const targetWasPaid = receipt.paidCurrency === 'USD'
      && receipt.paidTotalCents >= revisionTotal(revision);
    if (targetWasPaid) {
      await applyRevision(tx, orderId, revision);
    } else {
      await tx.order.update({
        where: { id: orderId },
        data: { pendingRevision: Prisma.DbNull },
      });
    }
  }));
}
