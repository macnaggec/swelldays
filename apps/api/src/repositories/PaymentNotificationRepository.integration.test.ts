import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from 'server/db';
import type { StoredPaymentEvent } from 'server/domain/PaymentNotification';
import { resetDb } from 'test/helpers/resetDb';
import { PaymentNotificationRepository } from './PaymentNotificationRepository';
import type { IPaymentNotificationRepository } from './PaymentNotificationRepository';
import { paymentAttemptRepository } from './PaymentAttemptRepository';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { PaymentService } from 'server/services/PaymentService';
import { PurchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';
import { orderRepository } from './OrderRepository';
import { fulfillmentRepository } from './FulfillmentRepository';

const repository = new PaymentNotificationRepository();
const NOW = new Date('2026-09-14T18:30:00Z');

function event(suffix: string): StoredPaymentEvent {
  return {
    eventKey: `event:paddle:${suffix}`, eventType: 'order.completed', provider: 'paddle',
    sourceEventId: suffix, occurredAt: NOW, environment: 'sandbox', providerTransactionId: `txn_${suffix}`,
    correlationAttemptId: `attempt_${suffix}`, providerTestMode: true,
  };
}

async function clear(): Promise<void> {
  await prisma.paymentNotification.deleteMany();
  await prisma.paymentAttempt.deleteMany();
  await resetDb();
}

beforeEach(clear);
afterAll(async () => { await clear(); await prisma.$disconnect(); });

describe('PaymentNotificationRepository durable inbox', () => {
  it('atomically deduplicates one provider event and stores normalized facts only', async () => {
    const stable = event('evt_1');
    const [first, second] = await Promise.all([repository.store(stable, NOW), repository.store(stable, NOW)]);
    expect([first.inserted, second.inserted].sort()).toEqual([false, true]);
    expect(first.record.id).toBe(second.record.id);
    const rows = await prisma.paymentNotification.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toMatch(/rawBody|authorization|signature|jwt-secret/);
  });

  it('leases different rows concurrently, reclaims crashes, and rejects stale claim tokens', async () => {
    await repository.store(event('evt_1'), NOW);
    await repository.store(event('evt_2'), NOW);
    const firstRepository = new PaymentNotificationRepository();
    const secondRepository = new PaymentNotificationRepository();
    const [first, second] = await Promise.all([
      firstRepository.claimNext(NOW, 30_000, 10), secondRepository.claimNext(NOW, 30_000, 10),
    ]);
    expect(first?.id).not.toBe(second?.id);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    if (first === null || second === null) return;
    expect(await repository.complete(second, 'ignored', NOW)).toBe(true);
    const reclaimed = await repository.claimNext(new Date(NOW.getTime() + 30_001), 30_000, 10);
    expect(reclaimed?.id).toBe(first.id);
    expect(reclaimed?.processingAttempts).toBe(2);
    expect(await repository.complete(first, 'fulfilled', NOW)).toBe(false);
    expect(await repository.retry(first, 'claim-lost', NOW, new Date(NOW.getTime() + 60_000), 10)).toBe('claim-lost');
  });

  it('exhausts at ten attempts, replays terminal rows, and paginates by status', async () => {
    const stored = await repository.store(event('evt_1'), NOW);
    await prisma.paymentNotification.update({ where: { id: stored.record.id }, data: { processingAttempts: 9 } });
    const claim = await repository.claimNext(NOW, 30_000, 10);
    expect(claim?.processingAttempts).toBe(10);
    if (claim === null) return;
    const availableAt = new Date(NOW.getTime() + 60 * 60_000);
    await expect(repository.retry(claim, 'provider-unreachable', NOW, availableAt, 10)).resolves.toBe('exhausted');
    const exhausted = await repository.list({ status: 'exhausted', limit: 1 });
    expect(exhausted.items).toHaveLength(1);
    expect(exhausted.items[0]).toMatchObject({ updatedAt: NOW, completedAt: NOW, availableAt });
    await expect(repository.replay(randomUUID(), NOW)).resolves.toBeNull();
    const replayed = await repository.replay(claim.id, NOW);
    expect(replayed).toEqual(expect.objectContaining({ status: 'received', processingAttempts: 0 }));
    await expect(repository.replay(claim.id, NOW)).resolves.toBeNull();
  });

  it('terminalizes a crashed tenth claim after its lease expires', async () => {
    const stored = await repository.store(event('evt_tenth_crash'), NOW);
    await prisma.paymentNotification.update({ where: { id: stored.record.id }, data: {
      status: 'PROCESSING', processingAttempts: 10, claimToken: 'lost-worker', claimExpiresAt: NOW,
    } });
    await expect(repository.claimNext(new Date(NOW.getTime() + 1), 30_000, 10)).resolves.toBeNull();
    await expect(repository.list({ status: 'exhausted', limit: 10 })).resolves.toEqual(expect.objectContaining({
      items: [expect.objectContaining({ id: stored.record.id, lastErrorCode: 'claim-lost' })],
    }));
  });

  it('recovers a crash after fulfillment without duplicating delivery or seller credit', async () => {
    const seller = await prisma.user.create({ data: { email: `seller-${randomUUID()}@example.com` } });
    const buyer = await prisma.user.create({ data: { email: `buyer-${randomUUID()}@example.com` } });
    const session = await prisma.surfSession.create({ data: { photographerId: seller.id, status: 'PUBLISHED' } });
    const media = await prisma.mediaItem.create({ data: {
      sessionId: session.id, photographerId: seller.id, status: 'PUBLISHED', price: 1000,
      capturedAt: NOW, lightboxUrl: 'https://example.test/full.jpg', thumbnailUrl: 'https://example.test/thumb.jpg',
      cloudinaryPublicId: `test/${randomUUID()}`,
    } });
    const order = await prisma.order.create({ data: {
      buyerId: buyer.id, clientRequestId: randomUUID(), totalAmount: 1000, status: OrderStatus.PENDING,
      items: { create: [{ mediaItemId: media.id, unitAmountCents: 1000, currency: 'USD', sellerId: seller.id,
        feePolicyVersion: 'paddle-50c-30-v1', platformFeeAmount: 350, sellerEarningsAmount: 650,
        deliverablePublicId: media.cloudinaryPublicId, deliverableType: 'PHOTO' }] },
    } });
    const attempt = await paymentAttemptRepository.prepareAttempt({
      orderId: order.id, provider: 'paddle', expectedAmountCents: 1000, expectedCurrency: 'USD',
    });
    await paymentAttemptRepository.bindProviderSession({
      attemptId: attempt.id, environment: 'sandbox', providerTransactionId: 'txn_crash',
      checkoutUrl: 'https://example.test/pay', expiresAt: null, providerTestMode: true,
    });
    await repository.store({ ...event('evt_crash'), providerTransactionId: 'txn_crash',
      correlationAttemptId: attempt.id }, NOW);

    const adapter: PaymentAdapter = {
      provider: 'paddle', createCheckoutSession: vi.fn(), verifyWebhook: vi.fn(), parseWebhookEvent: vi.fn(),
      expectedAccountId: () => null,
      retrieveReceipt: vi.fn().mockResolvedValue({
        identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: 'txn_crash' },
        status: 'paid', paidTotalCents: 1000, paidCurrency: 'USD', subtotalCents: null, taxCents: null,
        discountCents: null, settlementNetCents: null, providerAccountId: null, providerTestMode: true,
      }),
    };
    const fulfillment = new PurchaseFulfillmentService(orderRepository, fulfillmentRepository,
      { tryGeneratePermanentPreviewUrl: () => 'https://example.test/preview.jpg' });
    const crashAfterCommit: IPaymentNotificationRepository = {
      store: repository.store.bind(repository), claimNext: repository.claimNext.bind(repository),
      bind: repository.bind.bind(repository), reject: repository.reject.bind(repository), retry: repository.retry.bind(repository),
      list: repository.list.bind(repository), replay: repository.replay.bind(repository),
      complete: vi.fn().mockResolvedValue(false),
    };
    let clock = NOW;
    const firstService = new PaymentService(paymentAttemptRepository, crashAfterCommit, adapter, [adapter], fulfillment, () => clock);
    await expect(firstService.processPendingNotifications()).resolves.toEqual(expect.objectContaining({ claimed: 1, completed: 0 }));
    clock = new Date(NOW.getTime() + 30_001);
    const recoveringService = new PaymentService(paymentAttemptRepository, repository, adapter, [adapter], fulfillment, () => clock);
    await expect(recoveringService.processPendingNotifications()).resolves.toEqual(expect.objectContaining({ claimed: 1, completed: 1 }));

    const [notificationRow, completedOrder, purchases, sales, creditedSeller] = await Promise.all([
      prisma.paymentNotification.findFirstOrThrow({ where: { eventKey: 'event:paddle:evt_crash' } }),
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.purchase.findMany({ where: { orderId: order.id } }),
      prisma.transaction.findMany({ where: { userId: seller.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: seller.id } }),
    ]);
    expect(notificationRow).toMatchObject({ status: 'COMPLETED', resolution: 'COMPLETED_DUPLICATE', processingAttempts: 2 });
    expect(completedOrder.status).toBe(OrderStatus.COMPLETED);
    expect(purchases).toHaveLength(1);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ type: TransactionType.SALE, status: TransactionStatus.COMPLETED, amount: 650 });
    expect(creditedSeller.balance).toBe(650);
  });
});
