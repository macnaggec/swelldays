import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from 'server/db';
import { PaymentAdjustmentRepository } from './PaymentAdjustmentRepository';
import { LedgerRepository } from './LedgerRepository';
import { LedgerService } from 'server/services/LedgerService';
import { resetDb } from 'test/helpers/resetDb';

const repository = new PaymentAdjustmentRepository();
const ledger = new LedgerRepository();
const ledgerService = new LedgerService(ledger);

async function clear() {
  await prisma.payoutRequest.deleteMany(); await prisma.transaction.deleteMany();
  await prisma.paymentAdjustmentAllocation.deleteMany(); await prisma.paymentAdjustment.deleteMany();
  await prisma.paidOrderLine.deleteMany(); await prisma.paymentNotification.deleteMany();
  await prisma.paymentAttempt.deleteMany(); await resetDb();
}
beforeEach(clear);
afterAll(async () => { await clear(); await prisma.$disconnect(); });

async function fixture() {
  const seller = await prisma.user.create({ data: { email: `seller-${randomUUID()}@example.com`, balance: 800 } });
  const buyer = await prisma.user.create({ data: { email: `buyer-${randomUUID()}@example.com` } });
  const operator = await prisma.user.create({ data: { email: `admin-${randomUUID()}@example.com`, role: 'ADMIN' } });
  const session = await prisma.surfSession.create({ data: { photographerId: seller.id, status: 'PUBLISHED' } });
  const media = await prisma.mediaItem.create({ data: { sessionId: session.id, photographerId: seller.id,
    capturedAt: new Date(), lightboxUrl: 'https://example.com/a', thumbnailUrl: 'https://example.com/t',
    cloudinaryPublicId: `asset-${randomUUID()}`, status: 'PUBLISHED', price: 1000 } });
  const order = await prisma.order.create({ data: { buyerId: buyer.id, clientRequestId: randomUUID(), totalAmount: 1000,
    status: 'COMPLETED', externalOrderId: randomUUID(), items: { create: { mediaItemId: media.id,
      unitAmountCents: 1000, currency: 'USD', sellerId: seller.id, feePolicyVersion: 'standard-20-v1',
      platformFeeAmount: 200, sellerEarningsAmount: 800, deliverablePublicId: media.cloudinaryPublicId,
      deliverableType: 'PHOTO' } } }, include: { items: true } });
  const attempt = await prisma.paymentAttempt.create({ data: { orderId: order.id, provider: 'PADDLE',
    environment: 'SANDBOX', providerTransactionId: `txn-${randomUUID()}`, creationState: 'READY',
    expectedAmountCents: 1000, expectedCurrency: 'USD' } });
  const purchase = await prisma.purchase.create({ data: { buyerId: buyer.id, mediaItemId: media.id, orderId: order.id,
    amountPaid: 1000, platformFee: 200, photographerEarned: 800 } });
  const line = await prisma.paidOrderLine.create({ data: { paymentAttemptId: attempt.id, orderItemId: order.items[0]!.id,
    orderId: order.id, mediaItemId: media.id, sellerId: seller.id, buyerId: buyer.id, amountPaid: 1000,
    platformFee: 200, sellerEarnings: 800, currency: 'USD', deliverablePublicId: media.cloudinaryPublicId,
    deliverableType: 'PHOTO', deliveryStatus: 'DELIVERED', purchaseId: purchase.id } });
  await prisma.transaction.create({ data: { userId: seller.id, amount: 800, type: 'SALE', status: 'COMPLETED',
    externalOrderId: order.externalOrderId, paidOrderLineId: line.id } });
  return { seller, buyer, operator, attempt, line };
}

describe('PaymentAdjustmentRepository', () => {
  it('records monotonically, applies cumulative partial refunds once, and preserves ledger identity', async () => {
    const { seller, operator, attempt, line } = await fixture();
    const identity = { provider: 'paddle' as const, environment: 'sandbox' as const,
      providerTransactionId: attempt.providerTransactionId! };
    const first = await repository.record({ providerAdjustmentId: 'adj-1', identity, action: 'refund', status: 'approved',
      amountCents: 400, currency: 'USD', occurredAt: new Date('2026-09-15T00:00:00Z'),
      updatedAt: new Date('2026-09-15T01:00:00Z') }, attempt.id);
    await repository.record({ providerAdjustmentId: 'adj-1', identity, action: 'refund', status: 'pending-approval',
      amountCents: 300, currency: 'USD', occurredAt: new Date('2026-09-15T00:00:00Z'),
      updatedAt: new Date('2026-09-15T00:30:00Z') }, attempt.id);
    await repository.apply({ adjustmentId: first.id, allocations: [{ paidOrderLineId: line.id, amountCents: 400 }],
      revokeEntitlements: false, note: 'Approved partial refund', operatorId: operator.id });
    await expect(repository.apply({ adjustmentId: first.id, allocations: [{ paidOrderLineId: line.id, amountCents: 400 }],
      revokeEntitlements: false, note: 'duplicate', operatorId: operator.id })).rejects.toThrow();
    await expect(repository.record({ providerAdjustmentId: 'adj-1', identity, action: 'refund', status: 'approved',
      amountCents: 500, currency: 'USD', occurredAt: new Date('2026-09-15T00:00:00Z'),
      updatedAt: new Date('2026-09-15T02:00:00Z') }, attempt.id)).rejects.toThrow('economics cannot change');

    expect(await prisma.paymentAdjustment.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      providerStatus: 'APPROVED', amountCents: 400, resolution: 'APPLIED' });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).toMatchObject({ balance: 480 });
    expect(await prisma.transaction.findMany({ where: { type: 'ADJUSTMENT' } })).toEqual([
      expect.objectContaining({ amount: -320, paymentAdjustmentAllocationId: expect.any(String) }),
    ]);
  });

  it('nets a partial dispute reversal before allowing a later refund', async () => {
    const { seller, operator, attempt, line } = await fixture();
    const identity = { provider: 'paddle' as const, environment: 'sandbox' as const,
      providerTransactionId: attempt.providerTransactionId! };
    const facts = { identity, status: 'approved' as const, currency: 'USD',
      occurredAt: new Date('2026-09-15T00:00:00Z'), updatedAt: new Date('2026-09-15T01:00:00Z') };
    const dispute = await repository.record({ ...facts, providerAdjustmentId: 'dispute-1', action: 'dispute', amountCents: 400 }, attempt.id);
    await repository.apply({ adjustmentId: dispute.id, allocations: [{ paidOrderLineId: line.id, amountCents: 400 }],
      revokeEntitlements: false, note: 'dispute accepted', operatorId: operator.id });
    const reversal = await repository.record({ ...facts, providerAdjustmentId: 'reversal-1', action: 'dispute-reversal', amountCents: 400,
      updatedAt: new Date('2026-09-15T02:00:00Z') }, attempt.id);
    await repository.apply({ adjustmentId: reversal.id, reversesAdjustmentId: dispute.id,
      allocations: [{ paidOrderLineId: line.id, amountCents: 400 }], revokeEntitlements: false,
      note: 'dispute reversed', operatorId: operator.id });
    const refund = await repository.record({ ...facts, providerAdjustmentId: 'refund-after-reversal', action: 'refund', amountCents: 500,
      updatedAt: new Date('2026-09-15T03:00:00Z') }, attempt.id);
    await repository.apply({ adjustmentId: refund.id, allocations: [{ paidOrderLineId: line.id, amountCents: 500 }],
      revokeEntitlements: false, note: 'later refund', operatorId: operator.id });
    const wrongReversal = await repository.record({ ...facts, providerAdjustmentId: 'wrong-reversal',
      action: 'dispute-reversal', amountCents: 500, updatedAt: new Date('2026-09-15T04:00:00Z') }, attempt.id);
    await expect(repository.apply({ adjustmentId: wrongReversal.id, reversesAdjustmentId: refund.id,
      allocations: [{ paidOrderLineId: line.id, amountCents: 500 }], revokeEntitlements: false,
      note: 'wrong source kind', operatorId: operator.id })).rejects.toThrow('Invalid reversal source');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).balance).toBe(400);
    expect((await prisma.transaction.findMany({ where: { type: 'ADJUSTMENT' }, orderBy: { createdAt: 'asc' } }))
      .map((transaction) => transaction.amount)).toEqual([-320, 320, -400]);
  });

  it('keeps refund-before-delivery pending, then applies after paid lines exist', async () => {
    const { seller, operator, attempt, line } = await fixture();
    await prisma.transaction.deleteMany(); await prisma.paidOrderLine.delete({ where: { id: line.id } });
    await prisma.purchase.deleteMany(); await prisma.user.update({ where: { id: seller.id }, data: { balance: 0 } });
    const adjustment = await repository.record({ providerAdjustmentId: 'early-refund',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'approved', amountCents: 1000, currency: 'USD',
      occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    await expect(repository.apply({ adjustmentId: adjustment.id, allocations: [{ paidOrderLineId: line.id, amountCents: 1000 }],
      revokeEntitlements: false, note: 'too early', operatorId: operator.id })).rejects.toThrow();
    expect(await prisma.paymentAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } })).toMatchObject({ resolution: 'PENDING_REVIEW' });
    const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: attempt.orderId } });
    const media = await prisma.mediaItem.findUniqueOrThrow({ where: { id: orderItem.mediaItemId } });
    const purchase = await prisma.purchase.create({ data: { buyerId: line.buyerId, mediaItemId: line.mediaItemId,
      orderId: attempt.orderId, amountPaid: 1000, platformFee: 200, photographerEarned: 800 } });
    const delivered = await prisma.paidOrderLine.create({ data: { paymentAttemptId: attempt.id, orderItemId: orderItem.id,
      orderId: attempt.orderId, mediaItemId: line.mediaItemId, sellerId: seller.id, buyerId: line.buyerId,
      amountPaid: 1000, platformFee: 200, sellerEarnings: 800, currency: 'USD', deliverablePublicId: media.cloudinaryPublicId,
      deliverableType: 'PHOTO', deliveryStatus: 'DELIVERED', purchaseId: purchase.id } });
    await prisma.transaction.create({ data: { userId: seller.id, amount: 800, type: 'SALE', status: 'COMPLETED', paidOrderLineId: delivered.id } });
    await prisma.user.update({ where: { id: seller.id }, data: { balance: 800 } });
    await repository.apply({ adjustmentId: adjustment.id, allocations: [{ paidOrderLineId: delivered.id, amountCents: 1000 }],
      revokeEntitlements: false, note: 'delivery now recorded', operatorId: operator.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).balance).toBe(0);
  });

  it('fully refunds and resolves a duplicate line with no seller ledger delta', async () => {
    const { seller, operator, attempt, line } = await fixture();
    await prisma.transaction.deleteMany(); await prisma.paidOrderLine.update({ where: { id: line.id }, data: {
      deliveryStatus: 'COMPENSATION_REQUIRED', purchaseId: null, exceptionReason: 'duplicate-entitlement' } });
    await prisma.purchase.deleteMany(); await prisma.user.update({ where: { id: seller.id }, data: { balance: 0 } });
    const adjustment = await repository.record({ providerAdjustmentId: 'duplicate-refund',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'approved', amountCents: 1000, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    await repository.apply({ adjustmentId: adjustment.id, allocations: [{ paidOrderLineId: line.id, amountCents: 1000 }],
      revokeEntitlements: false, note: 'duplicate refunded', operatorId: operator.id });
    await repository.resolveCompensation(line.id, adjustment.id, 'refund confirmed', operator.id);
    expect(await prisma.transaction.count({ where: { type: 'ADJUSTMENT' } })).toBe(0);
    expect(await prisma.paymentAdjustmentAllocation.findFirstOrThrow()).toMatchObject({ sellerLedgerAmount: 0 });
    expect(await prisma.paidOrderLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ resolvedAt: expect.any(Date) });
  });

  it('allows one concurrent apply effect and creates an explicit deficit after completed payout', async () => {
    const { seller, operator, attempt, line } = await fixture();
    const reservation = await ledger.reservePayout({ photographerId: seller.id, amountCents: 800 });
    await ledger.markPayoutProcessing(reservation.payoutRequest.id); await ledger.completePayout(reservation.payoutRequest.id, 'transfer-1');
    const adjustment = await repository.record({ providerAdjustmentId: 'after-payout',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'approved', amountCents: 1000, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    const command = { adjustmentId: adjustment.id, allocations: [{ paidOrderLineId: line.id, amountCents: 1000 }],
      revokeEntitlements: false, note: 'refund after payout', operatorId: operator.id };
    const results = await Promise.allSettled([repository.apply(command), repository.apply(command)]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: seller.id } })).balance).toBe(-800);
    expect(await ledgerService.getSummary(seller.id)).toMatchObject({ availableBalanceCents: 0, deficitCents: 800 });
    expect((await ledger.getSummaryRecords(seller.id)).user?.balance).toBe(-800);
    expect(await ledger.findInvariantViolations()).toEqual([]);
    expect(await prisma.paymentAdjustmentAllocation.count()).toBe(1);
  });

  it('revokes access only when all funded lines are fully net adjusted', async () => {
    const { buyer, operator, attempt, line } = await fixture();
    const partial = await repository.record({ providerAdjustmentId: 'partial-refund',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'approved', amountCents: 500, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    await expect(repository.apply({ adjustmentId: partial.id,
      allocations: [{ paidOrderLineId: line.id, amountCents: 500 }], revokeEntitlements: true,
      note: 'partial must retain access', operatorId: operator.id })).rejects.toThrow('Funded paid line');
    expect(await prisma.purchase.count({ where: { buyerId: buyer.id, mediaItemId: line.mediaItemId } })).toBe(1);
    const adjustment = await repository.record({ providerAdjustmentId: 'full-refund',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'approved', amountCents: 1000, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    await repository.apply({ adjustmentId: adjustment.id, allocations: [{ paidOrderLineId: line.id, amountCents: 1000 }],
      revokeEntitlements: true, note: 'full refund and revoke', operatorId: operator.id });
    expect(await prisma.purchase.count({ where: { buyerId: buyer.id, mediaItemId: line.mediaItemId } })).toBe(1);
    expect(await prisma.purchase.findFirstOrThrow({ where: { buyerId: buyer.id, mediaItemId: line.mediaItemId } }))
      .toMatchObject({ revokedAt: expect.any(Date) });
  });

  it('records a CryptoCloud operator reference idempotently and rejects cross-attempt reuse', async () => {
    const { operator, attempt } = await fixture();
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { provider: 'CRYPTOCLOUD', environment: 'PRODUCTION' } });
    const command = { paymentAttemptId: attempt.id, providerAdjustmentId: 'support-case-77', action: 'refund' as const,
      status: 'approved' as const, amountCents: 1000, currency: 'USD', occurredAt: new Date(), updatedAt: new Date(),
      note: 'CryptoCloud support confirmed', operatorId: operator.id };
    const [first, second] = await Promise.all([repository.recordManual(command), repository.recordManual(command)]);
    expect(second.id).toBe(first.id); expect(await prisma.paymentAdjustment.count()).toBe(1);
    expect(first).toMatchObject({ provider: 'CRYPTOCLOUD', operatorId: operator.id, operatorNote: command.note });
    const otherOrder = await prisma.order.create({ data: { clientRequestId: randomUUID(), totalAmount: 1000 } });
    const otherAttempt = await prisma.paymentAttempt.create({ data: { orderId: otherOrder.id, provider: 'CRYPTOCLOUD',
      environment: 'PRODUCTION', providerTransactionId: randomUUID(), creationState: 'READY', expectedAmountCents: 1000,
      expectedCurrency: 'USD' } });
    await expect(repository.recordManual({ ...command, paymentAttemptId: otherAttempt.id })).rejects.toThrow('another payment attempt');
  });

  it('dismisses an eligible provider rejection exactly once under concurrency', async () => {
    const { operator, attempt } = await fixture();
    const adjustment = await repository.record({ providerAdjustmentId: 'rejected-adjustment',
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: attempt.providerTransactionId! },
      action: 'refund', status: 'rejected', amountCents: 1000, currency: 'USD', occurredAt: new Date(), updatedAt: new Date() }, attempt.id);
    const results = await Promise.allSettled([
      repository.dismiss(adjustment.id, 'provider rejected', operator.id),
      repository.dismiss(adjustment.id, 'provider rejected', operator.id),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.paymentAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } })).toMatchObject({ resolution: 'DISMISSED' });
  });
});
