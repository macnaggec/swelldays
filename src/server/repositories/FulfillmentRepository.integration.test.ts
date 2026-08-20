import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OrderStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { FulfillmentRepository } from './FulfillmentRepository';

const repo = new FulfillmentRepository();

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function createOrderFixture() {
  const photographer = await prisma.user.create({
    data: { email: `photographer-${randomUUID()}@example.com`, balance: 0 },
  });
  const buyer = await prisma.user.create({
    data: { email: `buyer-${randomUUID()}@example.com` },
  });
  const session = await prisma.surfSession.create({
    data: { photographerId: photographer.id, status: 'PUBLISHED' },
  });
  const mediaItem = await prisma.mediaItem.create({
    data: {
      sessionId: session.id,
      photographerId: photographer.id,
      status: 'PUBLISHED',
      price: 1000,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/fulfillment.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/fulfillment-thumb.jpg',
      cloudinaryPublicId: 'swelldays/test/fulfillment',
    },
  });
  const order = await prisma.order.create({
    data: {
      buyerId: buyer.id,
      totalAmount: 1000,
      status: OrderStatus.PENDING,
      items: { create: [{ mediaItemId: mediaItem.id }] },
    },
  });

  return { photographer, buyer, mediaItem, order };
}

describe('FulfillmentRepository.commitFulfillment', () => {
  it('completes the order, writes the purchase, and credits photographer earnings through the ledger', async () => {
    const { photographer, buyer, mediaItem, order } = await createOrderFixture();
    const externalOrderId = `CC-${randomUUID()}`;

    await repo.commitFulfillment({
      orderId: order.id,
      externalOrderId,
      purchases: [{
        orderId: order.id,
        mediaItemId: mediaItem.id,
        buyerId: buyer.id,
        guestEmail: null,
        downloadToken: randomUUID(),
        amountPaid: 1000,
        platformFee: 200,
        photographerEarned: 800,
        previewUrl: 'https://res.cloudinary.com/test/fulfillment-preview.jpg',
      }],
      earnings: [{ photographerId: photographer.id, amount: 800 }],
    });

    const [updatedOrder, purchases, updatedPhotographer, transactions] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchase.findMany({ where: { orderId: order.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: photographer.id } }),
      prisma.transaction.findMany({ where: { userId: photographer.id } }),
    ]);

    expect(updatedOrder.status).toBe(OrderStatus.COMPLETED);
    expect(updatedOrder.externalOrderId).toBe(externalOrderId);

    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({
      mediaItemId: mediaItem.id,
      buyerId: buyer.id,
      amountPaid: 1000,
      platformFee: 200,
      photographerEarned: 800,
    });

    expect(updatedPhotographer.balance).toBe(800);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      userId: photographer.id,
      amount: 800,
      type: TransactionType.SALE,
      status: TransactionStatus.COMPLETED,
      externalOrderId,
    });
  });
});
