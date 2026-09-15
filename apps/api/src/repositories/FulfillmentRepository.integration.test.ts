import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { FulfillmentRepository, type PaidLineCandidate } from './FulfillmentRepository';

const repository = new FulfillmentRepository();
async function clear() { await prisma.payoutRequest.deleteMany(); await prisma.transaction.deleteMany();
  await prisma.paymentAdjustmentAllocation.deleteMany(); await prisma.paymentAdjustment.deleteMany();
  await prisma.paidOrderLine.deleteMany(); await prisma.paymentNotification.deleteMany(); await prisma.paymentAttempt.deleteMany();
  await resetDb(); }
beforeEach(clear); afterAll(async () => { await clear(); await prisma.$disconnect(); });

async function fixture() {
  const seller = await prisma.user.create({ data: { email: `seller-${randomUUID()}@example.com` } });
  const buyer = await prisma.user.create({ data: { email: `buyer-${randomUUID()}@example.com` } });
  const session = await prisma.surfSession.create({ data: { photographerId: seller.id, status: 'PUBLISHED' } });
  const media = await prisma.mediaItem.create({ data: { sessionId: session.id, photographerId: seller.id,
    capturedAt: new Date(), lightboxUrl: 'lightbox', thumbnailUrl: 'thumb', cloudinaryPublicId: randomUUID(),
    status: 'PUBLISHED', price: 1000 } });
  const order = await prisma.order.create({ data: { buyerId: buyer.id, clientRequestId: randomUUID(), totalAmount: 1000,
    items: { create: { mediaItemId: media.id, unitAmountCents: 1000, currency: 'USD', sellerId: seller.id,
      feePolicyVersion: 'standard-20-v1', platformFeeAmount: 200, sellerEarningsAmount: 800,
      deliverablePublicId: media.cloudinaryPublicId, deliverableType: 'PHOTO' } } }, include: { items: true } });
  const attempt = await prisma.paymentAttempt.create({ data: { orderId: order.id, provider: 'PADDLE', environment: 'SANDBOX',
    providerTransactionId: randomUUID(), creationState: 'READY', expectedAmountCents: 1000, expectedCurrency: 'USD' } });
  const paidLine: PaidLineCandidate = { orderItemId: order.items[0]!.id, mediaItemId: media.id, sellerId: seller.id,
    buyerId: buyer.id, guestEmail: null, downloadToken: randomUUID(), amountPaid: 1000, platformFee: 200,
    sellerEarnings: 800, currency: 'USD', deliverablePublicId: media.cloudinaryPublicId,
    deliverableType: 'PHOTO', previewUrl: 'preview' };
  return { seller, buyer, media, order, attempt, paidLine };
}

describe('FulfillmentRepository.commitFulfillment', () => {
  it('atomically creates one entitlement, paid line, source-linked sale, and balance', async () => {
    const f = await fixture();
    const result = await repository.commitFulfillment({ orderId: f.order.id, paymentAttemptId: f.attempt.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine] });
    expect(result).toMatchObject({ applied: true, hasExceptions: false });
    const line = await prisma.paidOrderLine.findFirstOrThrow();
    expect(line).toMatchObject({ deliveryStatus: 'DELIVERED', purchaseId: expect.any(String) });
    expect(await prisma.transaction.findFirstOrThrow()).toMatchObject({ amount: 800, paidOrderLineId: line.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.seller.id } })).balance).toBe(800);
  });

  it('preserves a second paid line as compensation-required without another entitlement or seller credit', async () => {
    const f = await fixture();
    await prisma.purchase.create({ data: { buyerId: f.buyer.id, mediaItemId: f.media.id, amountPaid: 1000,
      platformFee: 200, photographerEarned: 800 } });
    const result = await repository.commitFulfillment({ orderId: f.order.id, paymentAttemptId: f.attempt.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine] });
    expect(result).toMatchObject({ applied: true, hasExceptions: true });
    expect(await prisma.purchase.count()).toBe(1); expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.paidOrderLine.findFirstOrThrow()).toMatchObject({ deliveryStatus: 'COMPENSATION_REQUIRED' });
  });

  it('conserves mixed duplicate and newly delivered line economics', async () => {
    const f = await fixture();
    await prisma.purchase.create({ data: { buyerId: f.buyer.id, mediaItemId: f.media.id, amountPaid: 1000,
      platformFee: 200, photographerEarned: 800 } });
    const secondMedia = await prisma.mediaItem.create({ data: { sessionId: f.media.sessionId,
      photographerId: f.seller.id, capturedAt: new Date(), lightboxUrl: 'lightbox-2', thumbnailUrl: 'thumb-2',
      cloudinaryPublicId: randomUUID(), status: 'PUBLISHED', price: 1000 } });
    const secondItem = await prisma.orderItem.create({ data: { orderId: f.order.id, mediaItemId: secondMedia.id,
      unitAmountCents: 1000, currency: 'USD', sellerId: f.seller.id, feePolicyVersion: 'standard-20-v1',
      platformFeeAmount: 200, sellerEarningsAmount: 800, deliverablePublicId: secondMedia.cloudinaryPublicId,
      deliverableType: 'PHOTO' } });
    await prisma.order.update({ where: { id: f.order.id }, data: { totalAmount: 2000 } });
    await prisma.paymentAttempt.update({ where: { id: f.attempt.id }, data: { expectedAmountCents: 2000 } });

    const result = await repository.commitFulfillment({ orderId: f.order.id, paymentAttemptId: f.attempt.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine, {
        ...f.paidLine, orderItemId: secondItem.id, mediaItemId: secondMedia.id,
        deliverablePublicId: secondMedia.cloudinaryPublicId,
      }] });

    expect(result).toMatchObject({ applied: true, hasExceptions: true });
    const lines = await prisma.paidOrderLine.findMany({ orderBy: { mediaItemId: 'asc' } });
    expect(lines.map((line) => line.deliveryStatus).sort()).toEqual(['COMPENSATION_REQUIRED', 'DELIVERED']);
    expect(lines.reduce((sum, line) => sum + line.amountPaid, 0)).toBe(2000);
    expect(lines.reduce((sum, line) => sum + line.platformFee, 0)).toBe(400);
    expect(lines.reduce((sum, line) => sum + line.sellerEarnings, 0)).toBe(1600);
    expect(await prisma.purchase.count()).toBe(2);
    expect(await prisma.transaction.count({ where: { type: 'SALE' } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.seller.id } })).balance).toBe(800);
  });

  it('same-payment replay adds nothing', async () => {
    const f = await fixture(); const payload = { orderId: f.order.id, paymentAttemptId: f.attempt.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine] };
    await repository.commitFulfillment(payload);
    await expect(repository.commitFulfillment(payload)).resolves.toEqual({ applied: false });
    expect(await prisma.paidOrderLine.count()).toBe(1); expect(await prisma.transaction.count()).toBe(1);
  });

  it('creates one new active entitlement after a fully refunded entitlement was revoked', async () => {
    const f = await fixture();
    await prisma.purchase.create({ data: { buyerId: f.buyer.id, mediaItemId: f.media.id, amountPaid: 1000,
      platformFee: 200, photographerEarned: 800, revokedAt: new Date('2026-09-14T00:00:00Z') } });

    await repository.commitFulfillment({ orderId: f.order.id, paymentAttemptId: f.attempt.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine] });

    expect(await prisma.purchase.count({ where: { buyerId: f.buyer.id, mediaItemId: f.media.id } })).toBe(2);
    expect(await prisma.purchase.count({ where: { buyerId: f.buyer.id, mediaItemId: f.media.id,
      revokedAt: null } })).toBe(1);
    expect(await prisma.paidOrderLine.findFirstOrThrow()).toMatchObject({ deliveryStatus: 'DELIVERED' });
    expect(await prisma.transaction.count({ where: { type: 'SALE' } })).toBe(1);
  });

  it('rolls back the order claim when the payment attempt belongs to another order', async () => {
    const f = await fixture(); const other = await prisma.order.create({ data: { buyerId: f.buyer.id,
      clientRequestId: randomUUID(), totalAmount: 0 } });
    const wrong = await prisma.paymentAttempt.create({ data: { orderId: other.id, provider: 'PADDLE', environment: 'SANDBOX',
      providerTransactionId: randomUUID(), creationState: 'READY', expectedAmountCents: 0, expectedCurrency: 'USD' } });
    await expect(repository.commitFulfillment({ orderId: f.order.id, paymentAttemptId: wrong.id,
      buyerId: f.buyer.id, externalOrderId: randomUUID(), paidLines: [f.paidLine] })).rejects.toThrow('does not belong');
    expect(await prisma.order.findUniqueOrThrow({ where: { id: f.order.id } })).toMatchObject({ status: 'PENDING', externalOrderId: null });
    expect(await prisma.paidOrderLine.count()).toBe(0);
  });
});
