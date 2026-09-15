import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { LedgerRepository } from './LedgerRepository';
import { FulfillmentRepository } from './FulfillmentRepository';
import { PaymentAdjustmentRepository } from './PaymentAdjustmentRepository';

const ledger = new LedgerRepository();
const fulfillment = new FulfillmentRepository();
const adjustments = new PaymentAdjustmentRepository();

async function resetR07Db() {
  await prisma.payoutRequest.deleteMany(); await prisma.transaction.deleteMany();
  await prisma.paymentAdjustmentAllocation.deleteMany(); await prisma.paymentAdjustment.deleteMany();
  await prisma.paidOrderLine.deleteMany(); await prisma.paymentNotification.deleteMany();
  await prisma.paymentAttempt.deleteMany(); await resetDb();
}
beforeEach(resetR07Db);
afterAll(async () => {
  await resetR07Db();
  await prisma.$disconnect();
});

async function createPhotographer() {
  return prisma.user.create({
    data: { email: `photographer-${randomUUID()}@example.com`, balance: 0 },
  });
}

async function recordSale(photographerId: string, amount: number) {
  const buyer = await prisma.user.create({
    data: { email: `buyer-${randomUUID()}@example.com` },
  });
  const session = await prisma.surfSession.create({
    data: { photographerId, status: 'PUBLISHED' },
  });
  const mediaItem = await prisma.mediaItem.create({
    data: {
      sessionId: session.id,
      photographerId,
      status: 'PUBLISHED',
      price: amount,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/invariant.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/invariant-thumb.jpg',
      cloudinaryPublicId: `swelldays/test/invariant-${randomUUID()}`,
    },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      clientRequestId: randomUUID(),
      totalAmount: amount,
      status: OrderStatus.PENDING,
      items: { create: [{ mediaItemId: mediaItem.id, unitAmountCents: amount, currency: 'USD',
        sellerId: photographerId, feePolicyVersion: 'test-zero-fee-v1', platformFeeAmount: 0,
        sellerEarningsAmount: amount, deliverablePublicId: mediaItem.cloudinaryPublicId,
        deliverableType: 'PHOTO' }] },
    }, include: { items: true },
  });
  const attempt = await prisma.paymentAttempt.create({ data: { orderId: order.id, provider: 'PADDLE',
    environment: 'SANDBOX', providerTransactionId: randomUUID(), creationState: 'READY',
    expectedAmountCents: amount, expectedCurrency: 'USD' } });

  await fulfillment.commitFulfillment({
    orderId: order.id,
    paymentAttemptId: attempt.id,
    buyerId: buyer.id,
    externalOrderId: `CC-${randomUUID()}`,
    paidLines: [{
      orderItemId: order.items[0]!.id,
      mediaItemId: mediaItem.id,
      sellerId: photographerId,
      buyerId: buyer.id,
      guestEmail: null,
      downloadToken: randomUUID(),
      amountPaid: amount,
      platformFee: 0,
      sellerEarnings: amount,
      currency: 'USD', deliverablePublicId: mediaItem.cloudinaryPublicId, deliverableType: 'PHOTO',
      previewUrl: null,
    }],
  });
  return { attempt, line: await prisma.paidOrderLine.findFirstOrThrow({ where: { paymentAttemptId: attempt.id } }) };
}

describe('Ledger invariant: balance == Σ amount over {COMPLETED, PENDING} transactions', () => {
  it('holds only remaining credited earnings once despite multiple pending adjustments and leaves unrelated earnings payable', async () => {
    const photographer = await createPhotographer();
    const first = await recordSale(photographer.id, 1000); await recordSale(photographer.id, 1000);
    const identity = { provider: 'paddle' as const, environment: 'sandbox' as const,
      providerTransactionId: first.attempt.providerTransactionId! };
    const applied = await adjustments.record({ providerAdjustmentId: 'applied-part', identity, action: 'refund', status: 'approved',
      amountCents: 400, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, first.attempt.id);
    const operator = await prisma.user.create({ data: { email: `admin-${randomUUID()}@example.com`, role: 'ADMIN' } });
    await adjustments.apply({ adjustmentId: applied.id, allocations: [{ paidOrderLineId: first.line.id, amountCents: 400 }],
      revokeEntitlements: false, note: 'partial', operatorId: operator.id });
    await adjustments.record({ providerAdjustmentId: 'pending-one', identity, action: 'refund', status: 'pending-approval',
      amountCents: 100, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, first.attempt.id);
    await adjustments.record({ providerAdjustmentId: 'pending-two', identity, action: 'dispute', status: 'pending-approval',
      amountCents: 100, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, first.attempt.id);
    const summary = await ledger.getSummaryRecords(photographer.id);
    expect(summary.heldForReviewCents).toBe(600);
    await expect(ledger.reservePayout({ photographerId: photographer.id, amountCents: 1001 })).rejects.toThrow('Insufficient');
    await expect(ledger.reservePayout({ photographerId: photographer.id, amountCents: 1000 })).resolves.toBeDefined();
  });

  it('holds across a sale, a payout reservation, and a payout rejection', async () => {
    const photographer = await createPhotographer();

    await recordSale(photographer.id, 4500);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);

    const reservation = await ledger.reservePayout({
      photographerId: photographer.id,
      amountCents: 4500,
    });
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);

    await ledger.rejectPayout(reservation.payoutRequest.id, 'Bank details need review');
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('detects a manually corrupted balance', async () => {
    const photographer = await createPhotographer();
    await recordSale(photographer.id, 4500);

    await prisma.user.update({
      where: { id: photographer.id },
      data: { balance: 9999 },
    });

    await expect(ledger.findInvariantViolations()).resolves.toEqual([
      { userId: photographer.id, balance: 9999, expectedBalance: 4500 },
    ]);
  });
});
