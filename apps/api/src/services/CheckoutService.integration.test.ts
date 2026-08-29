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
