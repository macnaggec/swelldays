import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { LedgerRepository } from './LedgerRepository';
import { FulfillmentRepository } from './FulfillmentRepository';

const ledger = new LedgerRepository();
const fulfillment = new FulfillmentRepository();

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
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
      totalAmount: amount,
      status: OrderStatus.PENDING,
      items: { create: [{ mediaItemId: mediaItem.id }] },
    },
  });

  await fulfillment.commitFulfillment({
    orderId: order.id,
    externalOrderId: `CC-${randomUUID()}`,
    purchases: [{
      orderId: order.id,
      mediaItemId: mediaItem.id,
      buyerId: buyer.id,
      guestEmail: null,
      downloadToken: randomUUID(),
      amountPaid: amount,
      platformFee: 0,
      photographerEarned: amount,
      previewUrl: null,
    }],
    earnings: [{ photographerId, amount }],
  });
}

describe('Ledger invariant: balance == Σ amount over {COMPLETED, PENDING} transactions', () => {
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
