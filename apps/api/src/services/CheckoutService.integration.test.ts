import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { CheckoutService } from './CheckoutService';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import { cloudinaryService } from 'server/services/CloudinaryService';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { BadRequestError } from 'server/errors';

const mockPayment: PaymentAdapter = {
  createCheckoutSession: vi.fn().mockResolvedValue({ checkoutUrl: 'https://example.test/checkout' }),
  verifyWebhook: vi.fn(),
  parseWebhookEvent: vi.fn(),
};

const service = new CheckoutService(
  orderRepository,
  mediaRepository,
  purchaseRepository,
  mockPayment,
  cloudinaryService,
  'http://localhost:3000',
  'cryptocloud',
);

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

describe('CheckoutService.createCheckoutSession — concurrent buyer requests', () => {
  it('serializes two concurrent checkouts for the same buyer and item — exactly one PENDING order results', async () => {
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
        lightboxUrl: 'https://res.cloudinary.com/test/checkout-race.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/checkout-race-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/checkout-race',
      },
    });

    const results = await Promise.allSettled([
      service.createCheckoutSession(buyer.id, undefined, [mediaItem.id], randomUUID()),
      service.createCheckoutSession(buyer.id, undefined, [mediaItem.id], randomUUID()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(BadRequestError);
    expect((rejected[0]!.reason as Error).message).toContain('Some items already have a pending order');

    const pendingOrders = await prisma.order.findMany({
      where: { buyerId: buyer.id, status: 'PENDING' },
    });
    expect(pendingOrders).toHaveLength(1);
  });
});

describe('CheckoutService.createCheckoutSession — concurrent same-key requests (P04)', () => {
  it('serializes two concurrent checkouts under the SAME clientRequestId — both resolve to the one order created', async () => {
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
        lightboxUrl: 'https://res.cloudinary.com/test/checkout-samekey.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/checkout-samekey-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/checkout-samekey',
      },
    });

    const clientRequestId = randomUUID();
    const results = await Promise.allSettled([
      service.createCheckoutSession(buyer.id, undefined, [mediaItem.id], clientRequestId),
      service.createCheckoutSession(buyer.id, undefined, [mediaItem.id], clientRequestId),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<{ checkoutUrl: string; orderId: string }> => r.status === 'fulfilled',
    );

    expect(fulfilled).toHaveLength(2);
    expect(fulfilled[0]!.value.orderId).toBe(fulfilled[1]!.value.orderId);

    const orders = await prisma.order.findMany({ where: { buyerId: buyer.id, clientRequestId } });
    expect(orders).toHaveLength(1);
  });
});

describe('CheckoutService.createCheckoutSession — R01: order lines snapshot economics at checkout', () => {
  it('persists a complete, conserving snapshot per line, unaffected by a later catalog price edit', async () => {
    const photographerA = await prisma.user.create({
      data: { email: `photographer-a-${randomUUID()}@example.com`, balance: 0 },
    });
    const photographerB = await prisma.user.create({
      data: { email: `photographer-b-${randomUUID()}@example.com`, balance: 0 },
    });
    const buyer = await prisma.user.create({
      data: { email: `buyer-${randomUUID()}@example.com` },
    });
    const sessionA = await prisma.surfSession.create({
      data: { photographerId: photographerA.id, status: 'PUBLISHED' },
    });
    const sessionB = await prisma.surfSession.create({
      data: { photographerId: photographerB.id, status: 'PUBLISHED' },
    });
    const mediaItemA = await prisma.mediaItem.create({
      data: {
        sessionId: sessionA.id,
        photographerId: photographerA.id,
        status: 'PUBLISHED',
        price: 333,
        type: 'PHOTO',
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/r01-a.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/r01-a-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/r01-a',
      },
    });
    const mediaItemB = await prisma.mediaItem.create({
      data: {
        sessionId: sessionB.id,
        photographerId: photographerB.id,
        status: 'PUBLISHED',
        price: 1000,
        type: 'VIDEO',
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/r01-b.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/r01-b-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/r01-b',
      },
    });

    const { orderId } = await service.createCheckoutSession(
      buyer.id,
      undefined,
      [mediaItemA.id, mediaItemB.id],
      randomUUID(),
    );

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const orderItems = await prisma.orderItem.findMany({ where: { orderId }, orderBy: { mediaItemId: 'asc' } });
    expect(orderItems).toHaveLength(2);

    const catalogByMediaId = new Map([
      [mediaItemA.id, { photographerId: photographerA.id, cloudinaryPublicId: mediaItemA.cloudinaryPublicId, type: mediaItemA.type }],
      [mediaItemB.id, { photographerId: photographerB.id, cloudinaryPublicId: mediaItemB.cloudinaryPublicId, type: mediaItemB.type }],
    ]);

    for (const item of orderItems) {
      const catalog = catalogByMediaId.get(item.mediaItemId)!;
      expect(item.unitAmountCents).not.toBeNull();
      expect(item.currency).toBe('USD');
      expect(item.sellerId).toBe(catalog.photographerId);
      expect(item.feePolicyVersion).not.toBeNull();
      expect(item.platformFeeAmount).not.toBeNull();
      expect(item.sellerEarningsAmount).not.toBeNull();
      expect(item.deliverablePublicId).toBe(catalog.cloudinaryPublicId);
      expect(item.deliverableType).toBe(catalog.type);
      expect(item.platformFeeAmount! + item.sellerEarningsAmount!).toBe(item.unitAmountCents);
    }

    const sumUnitAmountCents = orderItems.reduce((sum, item) => sum + item.unitAmountCents!, 0);
    expect(sumUnitAmountCents).toBe(order.totalAmount);

    const snapshotBeforeEdit = orderItems;

    await prisma.mediaItem.update({ where: { id: mediaItemA.id }, data: { price: 10000 } });
    await prisma.mediaItem.update({ where: { id: mediaItemB.id }, data: { price: 1 } });

    const orderItemsAfterEdit = await prisma.orderItem.findMany({ where: { orderId }, orderBy: { mediaItemId: 'asc' } });

    expect(orderItemsAfterEdit).toEqual(snapshotBeforeEdit);
  });
});
