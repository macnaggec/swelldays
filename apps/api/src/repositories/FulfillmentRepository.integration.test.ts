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
      clientRequestId: randomUUID(),
      totalAmount: 1000,
      status: OrderStatus.PENDING,
      items: { create: [{ mediaItemId: mediaItem.id }] },
    },
  });

  return { photographer, buyer, session, mediaItem, order };
}

describe('FulfillmentRepository.commitFulfillment', () => {
  it('completes the order, writes the purchase, and credits photographer earnings through the ledger', async () => {
    const { photographer, buyer, mediaItem, order } = await createOrderFixture();
    const externalOrderId = `CC-${randomUUID()}`;

    await repo.commitFulfillment({
      orderId: order.id,
      buyerId: buyer.id,
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

  it('does not double-insert Purchase/Transaction rows when called twice for the same order', async () => {
    const { photographer, buyer, mediaItem, order } = await createOrderFixture();
    const externalOrderId = `CC-${randomUUID()}`;
    const fulfillmentPayload = {
      orderId: order.id,
      buyerId: buyer.id,
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
    };

    await repo.commitFulfillment(fulfillmentPayload);
    await expect(repo.commitFulfillment(fulfillmentPayload)).resolves.toEqual({ applied: false });

    const [purchases, transactions] = await Promise.all([
      prisma.purchase.findMany({ where: { orderId: order.id } }),
      prisma.transaction.findMany({ where: { userId: photographer.id } }),
    ]);

    expect(purchases).toHaveLength(1);
    expect(transactions).toHaveLength(1);
  });

  it('skips a colliding Purchase row but still completes the order and delivers the other items', async () => {
    const { photographer, buyer, session, mediaItem, order } = await createOrderFixture();
    const secondMediaItem = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        status: 'PUBLISHED',
        price: 1000,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/fulfillment-2.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/fulfillment-2-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/fulfillment-2',
      },
    });
    await prisma.orderItem.create({ data: { orderId: order.id, mediaItemId: secondMediaItem.id } });

    // Pre-seed a Purchase the buyer already holds for `mediaItem` from an earlier order —
    // this is the collision commitFulfillment must skip, not error on.
    await prisma.purchase.create({
      data: {
        buyerId: buyer.id,
        mediaItemId: mediaItem.id,
        amountPaid: 1000,
        platformFee: 200,
        photographerEarned: 800,
        downloadToken: randomUUID(),
      },
    });

    const externalOrderId = `CC-${randomUUID()}`;
    const result = await repo.commitFulfillment({
      orderId: order.id,
      buyerId: buyer.id,
      externalOrderId,
      purchases: [
        {
          orderId: order.id,
          mediaItemId: mediaItem.id,
          buyerId: buyer.id,
          guestEmail: null,
          downloadToken: randomUUID(),
          amountPaid: 1000,
          platformFee: 200,
          photographerEarned: 800,
          previewUrl: 'https://res.cloudinary.com/test/fulfillment-preview.jpg',
        },
        {
          orderId: order.id,
          mediaItemId: secondMediaItem.id,
          buyerId: buyer.id,
          guestEmail: null,
          downloadToken: randomUUID(),
          amountPaid: 1000,
          platformFee: 200,
          photographerEarned: 800,
          previewUrl: 'https://res.cloudinary.com/test/fulfillment-preview-2.jpg',
        },
      ],
      earnings: [{ photographerId: photographer.id, amount: 1600 }],
    });

    expect(result).toEqual({ applied: true, skippedMediaItemIds: [mediaItem.id] });

    const [updatedOrder, purchasesForMediaItem, purchasesForSecondItem] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchase.findMany({ where: { buyerId: buyer.id, mediaItemId: mediaItem.id } }),
      prisma.purchase.findMany({ where: { buyerId: buyer.id, mediaItemId: secondMediaItem.id } }),
    ]);

    expect(updatedOrder.status).toBe(OrderStatus.COMPLETED);
    expect(purchasesForMediaItem).toHaveLength(1); // still just the pre-seeded one — the duplicate was skipped
    expect(purchasesForSecondItem).toHaveLength(1); // the non-colliding item still delivered
  });
});
