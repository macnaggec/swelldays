import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { OrderRepository } from './OrderRepository';

const repo = new OrderRepository();

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function createBuyerAndMediaItem() {
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
      lightboxUrl: 'https://res.cloudinary.com/test/order-repository.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/order-repository-thumb.jpg',
      cloudinaryPublicId: 'swelldays/test/order-repository',
    },
  });

  return { buyer, mediaItem };
}

async function createPendingOrder(buyerId: string, mediaItemId: string, createdAt: Date) {
  return prisma.order.create({
    data: {
      buyerId,
      clientRequestId: randomUUID(),
      totalAmount: 1000,
      status: OrderStatus.PENDING,
      createdAt,
      items: { create: [{ mediaItemId }] },
    },
  });
}

describe('OrderRepository.findPendingMediaItemIds', () => {
  it('finds a PENDING order created inside the window', async () => {
    const { buyer, mediaItem } = await createBuyerAndMediaItem();
    await createPendingOrder(buyer.id, mediaItem.id, new Date());

    const result = await repo.findPendingMediaItemIds(
      buyer.id,
      [mediaItem.id],
      new Date(Date.now() - 60 * 60 * 1000),
    );

    expect(result).toEqual([mediaItem.id]);
  });

  it('does not find a PENDING order whose createdAt is backdated past the window cutoff', async () => {
    const { buyer, mediaItem } = await createBuyerAndMediaItem();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const backdatedCreatedAt = new Date(cutoff.getTime() - 60 * 60 * 1000);
    await createPendingOrder(buyer.id, mediaItem.id, backdatedCreatedAt);

    const result = await repo.findPendingMediaItemIds(buyer.id, [mediaItem.id], cutoff);

    expect(result).toEqual([]);
  });
});
