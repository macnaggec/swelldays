import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { MediaType, OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { LedgerRepository } from './LedgerRepository';
import { UserRepository } from './UserRepository';
import { FulfillmentRepository } from './FulfillmentRepository';
import { PaymentAdjustmentRepository } from './PaymentAdjustmentRepository';

const ledger = new LedgerRepository();
const users = new UserRepository();
const fulfillment = new FulfillmentRepository();
const adjustments = new PaymentAdjustmentRepository();

async function clearFinancialData() {
  await prisma.payoutRequest.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.paymentAdjustmentAllocation.deleteMany();
  await prisma.paymentAdjustment.deleteMany();
  await prisma.paidOrderLine.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.paymentNotification.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function creditedUser(amount: number) {
  const user = await prisma.user.create({
    data: { email: `closure-race-${randomUUID()}@example.com`, balance: amount },
  });
  if (amount !== 0) {
    await prisma.transaction.create({
      data: {
        userId: user.id,
        amount,
        type: 'SALE',
        status: 'COMPLETED',
        externalOrderId: `seed-${randomUUID()}`,
      },
    });
  }
  return user;
}

async function saleCommand(sellerId: string, amount: number) {
  const buyer = await prisma.user.create({ data: { email: `race-buyer-${randomUUID()}@example.com` } });
  const session = await prisma.surfSession.create({ data: { photographerId: sellerId, status: 'PUBLISHED' } });
  const mediaItem = await prisma.mediaItem.create({
    data: {
      sessionId: session.id,
      photographerId: sellerId,
      status: 'PUBLISHED',
      price: amount,
      capturedAt: new Date('2026-09-15T00:00:00Z'),
      lightboxUrl: 'https://example.com/race-lightbox.jpg',
      thumbnailUrl: 'https://example.com/race-thumbnail.jpg',
      cloudinaryPublicId: `race/${randomUUID()}`,
    },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      clientRequestId: randomUUID(),
      totalAmount: amount,
      status: OrderStatus.PENDING,
      items: { create: [{
        mediaItemId: mediaItem.id,
        unitAmountCents: amount,
        currency: 'USD',
        sellerId,
        feePolicyVersion: 'race-v1',
        platformFeeAmount: 0,
        sellerEarningsAmount: amount,
        deliverablePublicId: mediaItem.cloudinaryPublicId,
        deliverableType: 'PHOTO',
      }] },
    },
    include: { items: true },
  });
  const attempt = await prisma.paymentAttempt.create({
    data: {
      orderId: order.id,
      provider: 'PADDLE',
      environment: 'SANDBOX',
      providerTransactionId: randomUUID(),
      creationState: 'READY',
      expectedAmountCents: amount,
      expectedCurrency: 'USD',
    },
  });
  return {
    orderId: order.id,
    paymentAttemptId: attempt.id,
    buyerId: buyer.id,
    externalOrderId: `race-order-${randomUUID()}`,
    paidLines: [{
      orderItemId: order.items[0]!.id,
      mediaItemId: mediaItem.id,
      sellerId,
      buyerId: buyer.id,
      guestEmail: null,
      downloadToken: randomUUID(),
      amountPaid: amount,
      platformFee: 0,
      sellerEarnings: amount,
      currency: 'USD',
      deliverablePublicId: mediaItem.cloudinaryPublicId,
      deliverableType: MediaType.PHOTO,
      previewUrl: null,
    }],
  };
}

beforeEach(clearFinancialData);
afterAll(async () => {
  await clearFinancialData();
  await prisma.$disconnect();
});

describe('account closure and ledger serialization', () => {
  it('claims concurrent deletion once and records at most one exact forfeiture', async () => {
    const user = await creditedUser(4500);

    const results = await Promise.allSettled([
      users.anonymizeAndDelete(user.id),
      users.anonymizeAndDelete(user.id),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const forfeits = await prisma.transaction.findMany({ where: { userId: user.id, type: 'FORFEIT' } });
    expect(account).toMatchObject({ balance: 0 });
    expect(account.deletedAt).not.toBeNull();
    expect(forfeits).toHaveLength(1);
    expect(forfeits[0]).toMatchObject({ amount: -4500, status: 'COMPLETED' });
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('serializes deletion against payout reservation without resurrecting money', async () => {
    const user = await creditedUser(4500);

    const [closure, reservation] = await Promise.allSettled([
      users.anonymizeAndDelete(user.id),
      ledger.reservePayout({ photographerId: user.id, amountCents: 4500 }),
    ]);

    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const payouts = await prisma.payoutRequest.findMany({ where: { photographerId: user.id } });
    const forfeits = await prisma.transaction.findMany({ where: { userId: user.id, type: 'FORFEIT' } });
    if (closure.status === 'fulfilled') {
      expect(reservation.status).toBe('rejected');
      expect(account.deletedAt).not.toBeNull();
      expect(payouts).toHaveLength(0);
      expect(forfeits).toHaveLength(1);
      expect(forfeits[0]?.amount).toBe(-4500);
    } else {
      expect(reservation.status).toBe('fulfilled');
      expect(account.deletedAt).toBeNull();
      expect(account.balance).toBe(0);
      expect(payouts).toHaveLength(1);
      expect(payouts[0]?.status).toBe('PENDING');
      expect(forfeits).toHaveLength(0);
    }
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('serializes deletion against a sale and rolls back a post-close source line', async () => {
    const seller = await creditedUser(0);
    const command = await saleCommand(seller.id, 1800);

    const [closure, sale] = await Promise.allSettled([
      users.anonymizeAndDelete(seller.id),
      fulfillment.commitFulfillment(command),
    ]);

    expect(closure.status).toBe('fulfilled');
    const account = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
    const saleTransactions = await prisma.transaction.findMany({ where: { userId: seller.id, type: 'SALE' } });
    const forfeits = await prisma.transaction.findMany({ where: { userId: seller.id, type: 'FORFEIT' } });
    const sourceLines = await prisma.paidOrderLine.findMany({ where: { sellerId: seller.id } });
    expect(account.balance).toBe(0);
    expect(account.deletedAt).not.toBeNull();
    if (sale.status === 'fulfilled') {
      expect(saleTransactions).toHaveLength(1);
      expect(saleTransactions[0]?.amount).toBe(1800);
      expect(forfeits).toHaveLength(1);
      expect(forfeits[0]?.amount).toBe(-1800);
      expect(sourceLines).toHaveLength(1);
    } else {
      expect(saleTransactions).toHaveLength(0);
      expect(forfeits).toHaveLength(0);
      expect(sourceLines).toHaveLength(0);
    }
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('forfeits the exact credited sale when sale wins the schedule', async () => {
    const seller = await creditedUser(0);
    const command = await saleCommand(seller.id, 1800);

    await fulfillment.commitFulfillment(command);
    await users.anonymizeAndDelete(seller.id);

    const account = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
    const transactions = await prisma.transaction.findMany({ where: { userId: seller.id } });
    expect(account.balance).toBe(0);
    expect(account.deletedAt).not.toBeNull();
    expect(transactions.filter((transaction) => transaction.type === 'SALE').map((transaction) => transaction.amount)).toEqual([1800]);
    expect(transactions.filter((transaction) => transaction.type === 'FORFEIT').map((transaction) => transaction.amount)).toEqual([-1800]);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('rejects a post-close sale and rolls back its source row when closure wins the schedule', async () => {
    const seller = await creditedUser(0);
    const command = await saleCommand(seller.id, 1800);

    await users.anonymizeAndDelete(seller.id);
    await expect(fulfillment.commitFulfillment(command)).rejects.toThrow('Account is closed');

    const account = await prisma.user.findUniqueOrThrow({ where: { id: seller.id } });
    expect(account).toMatchObject({ balance: 0 });
    expect(account.deletedAt).not.toBeNull();
    expect(await prisma.paidOrderLine.count({ where: { sellerId: seller.id } })).toBe(0);
    expect(await prisma.transaction.count({ where: { userId: seller.id } })).toBe(0);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('blocks closure when payout reservation wins the schedule', async () => {
    const user = await creditedUser(4500);

    await ledger.reservePayout({ photographerId: user.id, amountCents: 4500 });
    await expect(users.anonymizeAndDelete(user.id)).rejects.toThrow('Your payout is still being processed');

    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .resolves.toMatchObject({ balance: 0, deletedAt: null });
    expect(await prisma.payoutRequest.count({ where: { photographerId: user.id, status: 'PENDING' } })).toBe(1);
    expect(await prisma.transaction.count({ where: { userId: user.id, type: 'FORFEIT' } })).toBe(0);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('rejects payout reservation when closure wins the schedule', async () => {
    const user = await creditedUser(4500);

    await users.anonymizeAndDelete(user.id);
    await expect(ledger.reservePayout({ photographerId: user.id, amountCents: 4500 }))
      .rejects.toThrow('Account is closed');

    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
      .resolves.toMatchObject({ balance: 0 });
    expect(await prisma.payoutRequest.count({ where: { photographerId: user.id } })).toBe(0);
    await expect(prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }))
      .resolves.toEqual([
        expect.objectContaining({ type: 'SALE', amount: 4500, status: 'COMPLETED' }),
        expect.objectContaining({ type: 'FORFEIT', amount: -4500, status: 'COMPLETED' }),
      ]);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('allows exactly one terminal payout transition in a reject/complete race', async () => {
    const user = await creditedUser(4500);
    const reservation = await ledger.reservePayout({ photographerId: user.id, amountCents: 4500 });
    await ledger.markPayoutProcessing(reservation.payoutRequest.id);

    const results = await Promise.allSettled([
      ledger.rejectPayout(reservation.payoutRequest.id, 'operator rejected'),
      ledger.completePayout(reservation.payoutRequest.id, 'transfer-race'),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const payout = await prisma.payoutRequest.findUniqueOrThrow({ where: { id: reservation.payoutRequest.id } });
    const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: reservation.transaction.id } });
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (payout.status === 'COMPLETED') {
      expect(account.balance).toBe(0);
      expect(transaction.status).toBe('COMPLETED');
      expect(payout.externalTransferId).toBe('transfer-race');
    } else {
      expect(payout.status).toBe('REJECTED');
      expect(account.balance).toBe(4500);
      expect(transaction.status).toBe('FAILED');
      expect(payout.note).toBe('operator rejected');
    }
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('includes a refund-first adjustment in the exact forfeiture', async () => {
    const seller = await creditedUser(0);
    const command = await saleCommand(seller.id, 1000);
    await fulfillment.commitFulfillment(command);
    const line = await prisma.paidOrderLine.findFirstOrThrow({ where: { sellerId: seller.id } });
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: command.paymentAttemptId } });
    const operator = await prisma.user.create({ data: { email: `race-admin-${randomUUID()}@example.com`, role: 'ADMIN' } });
    const adjustment = await adjustments.record({
      providerAdjustmentId: `race-refund-${randomUUID()}`,
      identity: {
        provider: 'paddle',
        environment: 'sandbox',
        providerTransactionId: attempt.providerTransactionId!,
      },
      action: 'refund',
      status: 'approved',
      amountCents: 400,
      currency: 'USD',
      occurredAt: new Date(),
      updatedAt: new Date(),
    }, attempt.id);

    await adjustments.apply({
      adjustmentId: adjustment.id,
      allocations: [{ paidOrderLineId: line.id, amountCents: 400 }],
      revokeEntitlements: false,
      note: 'race refund',
      operatorId: operator.id,
    });
    await users.anonymizeAndDelete(seller.id);

    const transactions = await prisma.transaction.findMany({ where: { userId: seller.id } });
    expect(transactions.filter((transaction) => transaction.type === 'SALE').map((transaction) => transaction.amount)).toEqual([1000]);
    expect(transactions.filter((transaction) => transaction.type === 'ADJUSTMENT').map((transaction) => transaction.amount)).toEqual([-400]);
    expect(transactions.filter((transaction) => transaction.type === 'FORFEIT').map((transaction) => transaction.amount)).toEqual([-600]);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });

  it('blocks a close-first schedule while a seller adjustment remains pending', async () => {
    const seller = await creditedUser(0);
    const command = await saleCommand(seller.id, 1000);
    await fulfillment.commitFulfillment(command);
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: command.paymentAttemptId } });
    await adjustments.record({
      providerAdjustmentId: `race-pending-${randomUUID()}`,
      identity: {
        provider: 'paddle',
        environment: 'sandbox',
        providerTransactionId: attempt.providerTransactionId!,
      },
      action: 'refund',
      status: 'approved',
      amountCents: 400,
      currency: 'USD',
      occurredAt: new Date(),
      updatedAt: new Date(),
    }, attempt.id);

    await expect(users.anonymizeAndDelete(seller.id)).rejects.toThrow(
      'Your account has a payment adjustment awaiting resolution.',
    );
    await expect(prisma.user.findUniqueOrThrow({ where: { id: seller.id } }))
      .resolves.toMatchObject({ deletedAt: null, balance: 1000 });
    expect(await prisma.transaction.count({ where: { userId: seller.id, type: 'FORFEIT' } })).toBe(0);
    await expect(ledger.findInvariantViolations()).resolves.toEqual([]);
  });
});
