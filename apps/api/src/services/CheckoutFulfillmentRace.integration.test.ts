import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { CheckoutService } from 'server/services/CheckoutService';
import { PurchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';
import { orderRepository } from 'server/repositories/OrderRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import { fulfillmentRepository } from 'server/repositories/FulfillmentRepository';
import { ledgerRepository } from 'server/repositories/LedgerRepository';
import { cloudinaryService } from 'server/services/CloudinaryService';
import type { IPaymentService } from 'server/services/PaymentService';
import { BadRequestError } from 'server/errors';

// ---------------------------------------------------------------------------
// R04 regression suite — converts the archived observation probe at
// docs/review/payment-safety/probes/checkout-race.integration.test.ts, which
// intentionally asserted the DEFECT (a second payable checkout appears). This
// file asserts the FIXED behavior: checkout and fulfillment now serialize on
// the same buyer-scoped advisory lock (server/lib/TransactionSerialization),
// so a payment can never commit in the gap between checkout's "already
// purchased?" and "already pending?" checks.
// ---------------------------------------------------------------------------

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function createPhotographer() {
  return prisma.user.create({
    data: { email: `photographer-${randomUUID()}@example.com`, balance: 0 },
  });
}

async function createBuyer() {
  return prisma.user.create({
    data: { email: `buyer-${randomUUID()}@example.com` },
  });
}

async function createSession(photographerId: string) {
  return prisma.surfSession.create({ data: { photographerId, status: 'PUBLISHED' } });
}

async function createPublishedMedia(photographerId: string, sessionId: string, priceCents = 1000) {
  const publicId = randomUUID();
  return prisma.mediaItem.create({
    data: {
      sessionId,
      photographerId,
      status: 'PUBLISHED',
      price: priceCents,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: `https://res.cloudinary.com/test/${publicId}.jpg`,
      thumbnailUrl: `https://res.cloudinary.com/test/${publicId}-thumb.jpg`,
      cloudinaryPublicId: `swelldays/test/${publicId}`,
    },
  });
}

/**
 * Fresh CheckoutService + PurchaseFulfillmentService per test, over the real
 * repositories, so each test gets its own payment-adapter call count and no
 * state bleeds between tests. Matches CheckoutService.integration.test.ts's
 * pattern for constructing CheckoutService; PurchaseFulfillmentService takes
 * (orders, fulfillment, cloudinary) with no media repository.
 */
function makeServices() {
  const mockPayment: Pick<IPaymentService, 'createAttempt'> = {
    createAttempt: vi.fn().mockResolvedValue({
      checkoutUrl: 'https://example.test/checkout',
      expiresAt: null,
    }),
  };
  const checkout = new CheckoutService(
    orderRepository,
    mediaRepository,
    purchaseRepository,
    mockPayment,
    cloudinaryService,
    'http://localhost:3000',
    'cryptocloud',
  );
  const fulfillment = new PurchaseFulfillmentService(
    orderRepository,
    fulfillmentRepository,
    { tryGeneratePermanentPreviewUrl: () => 'https://example.test/preview.jpg' },
  );
  return { checkout, fulfillment, mockPayment };
}

describe('CheckoutFulfillmentRace — R04: checkout and fulfillment share the buyer-scoped lock (CON-02)', () => {
  it('FIXED: checkout rejects when fulfillment commits inside the lock window — one order, one purchase, one sale', async () => {
    const photographer = await createPhotographer();
    const buyer = await createBuyer();
    const session = await createSession(photographer.id);
    const media = await createPublishedMedia(photographer.id, session.id);
    const { checkout, fulfillment, mockPayment } = makeServices();

    // The first order is created through the real checkout flow, so it
    // carries a real, conserving R01 economics snapshot — fulfillment's
    // requireOrderLineSnapshot needs that to pay anyone.
    const first = await checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID());

    // Instrument only scheduling: every transaction and query below executes
    // in PostgreSQL. After the second checkout's real Purchase SELECT returns
    // its empty snapshot, start (but do not await) a real fulfillment of the
    // first order in a second real transaction, then let the second checkout
    // continue. No query result, status, or database transaction is mocked.
    const originalTransaction = prisma.$transaction.bind(prisma);
    let interceptNextTransaction = true;
    let barrierReached = false;
    let fulfillmentPromise: Promise<void> = Promise.resolve();
    const transactionSpy = vi.spyOn(prisma, '$transaction');
    const wrappedTransaction = async (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
      const interceptThisTransaction = interceptNextTransaction;
      interceptNextTransaction = false;
      return originalTransaction(async (tx) => {
        if (!interceptThisTransaction) return operation(tx);
        const purchaseDelegate = new Proxy(tx.purchase, {
          get(target, property, receiver) {
            if (property !== 'findMany') return Reflect.get(target, property, receiver);
            return async (args: Prisma.PurchaseFindManyArgs) => {
              const rows = await target.findMany(args);
              expect(rows).toHaveLength(0);
              barrierReached = true;
              // Started, not awaited: with the fix, fulfillment blocks on the
              // same buyer lock this (checkout) transaction currently holds —
              // awaiting it here would deadlock the test rather than fail it.
              fulfillmentPromise = fulfillment.fulfillOrder(first.orderId, `race-${first.orderId}`);
              // Yield so fulfillment's async work (its two plain reads, then
              // its own $transaction call) reaches and blocks on the lock
              // before this transaction is allowed to continue past it.
              await new Promise((resolve) => setTimeout(resolve, 100));
              return rows;
            };
          },
        });
        const transactionDelegate = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === 'purchase') return purchaseDelegate;
            return Reflect.get(target, property, receiver);
          },
        });
        return operation(transactionDelegate);
      });
    };
    // Prisma has overloaded transaction signatures; this test only intercepts
    // the interactive transaction signature used by both services.
    transactionSpy.mockImplementation(wrappedTransaction as typeof prisma.$transaction);

    let secondCheckoutError: unknown;
    try {
      await checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID());
    } catch (err) {
      secondCheckoutError = err;
    } finally {
      transactionSpy.mockRestore();
    }
    // Fulfillment was only unblocked once the second checkout's transaction
    // ended (rollback releases the advisory lock) — wait for it to finish
    // before asserting on the database's final state.
    await fulfillmentPromise;

    expect(barrierReached).toBe(true);
    expect(secondCheckoutError).toBeInstanceOf(BadRequestError);
    expect((secondCheckoutError as Error).message).toContain('Some items already have a pending order');

    const orders = await prisma.order.findMany({ where: { buyerId: buyer.id } });
    expect(orders).toHaveLength(1);
    expect(orders[0]!.id).toBe(first.orderId);
    expect(orders[0]!.status).toBe('COMPLETED');

    const purchases = await prisma.purchase.findMany({ where: { buyerId: buyer.id, mediaItemId: media.id } });
    expect(purchases).toHaveLength(1);

    const saleTransactions = await prisma.transaction.findMany({ where: { userId: photographer.id, type: 'SALE' } });
    expect(saleTransactions).toHaveLength(1);

    const updatedPhotographer = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(updatedPhotographer.balance).toBe(saleTransactions[0]!.amount);

    // The one call is for the original order; the duplicate attempt was
    // rejected before it ever reached the payment provider.
    expect(mockPayment.createAttempt).toHaveBeenCalledTimes(1);
  });

  it('same-order duplicate events: two concurrent fulfillments of one order under the same external id apply once', async () => {
    const photographer = await createPhotographer();
    const buyer = await createBuyer();
    const session = await createSession(photographer.id);
    const media = await createPublishedMedia(photographer.id, session.id);
    const { checkout, fulfillment } = makeServices();

    const order = await checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID());
    const externalOrderId = `race-dup-${randomUUID()}`;

    await Promise.all([
      fulfillment.fulfillOrder(order.orderId, externalOrderId),
      fulfillment.fulfillOrder(order.orderId, externalOrderId),
    ]);

    const purchases = await prisma.purchase.findMany({ where: { buyerId: buyer.id, mediaItemId: media.id } });
    expect(purchases).toHaveLength(1);

    const saleTransactions = await prisma.transaction.findMany({ where: { userId: photographer.id, type: 'SALE' } });
    expect(saleTransactions).toHaveLength(1);

    const updatedPhotographer = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(updatedPhotographer.balance).toBe(saleTransactions[0]!.amount);
  });

  it('overlapping carts: two concurrent checkouts under different clientRequestIds sharing one item — exactly one PENDING order and one rejection', async () => {
    const photographer = await createPhotographer();
    const buyer = await createBuyer();
    const session = await createSession(photographer.id);
    const media = await createPublishedMedia(photographer.id, session.id);
    const { checkout } = makeServices();

    const results = await Promise.allSettled([
      checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID()),
      checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID()),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(BadRequestError);

    const pendingOrders = await prisma.order.findMany({ where: { buyerId: buyer.id, status: 'PENDING' } });
    expect(pendingOrders).toHaveLength(1);
  });

  it('multiple sellers in opposite item order: two orders fulfilled concurrently complete without a deadlock, each seller balance sums both sales', async () => {
    const sellerA = await createPhotographer();
    const sellerB = await createPhotographer();
    const buyer1 = await createBuyer();
    const buyer2 = await createBuyer();
    const sessionA = await createSession(sellerA.id);
    const sessionB = await createSession(sellerB.id);
    const mediaA = await createPublishedMedia(sellerA.id, sessionA.id, 1000);
    const mediaB = await createPublishedMedia(sellerB.id, sessionB.id, 2000);
    const { checkout, fulfillment } = makeServices();

    // Two different buyers, so each may independently purchase the same two
    // media items — Purchase uniqueness is per (buyerId, mediaItemId).
    const order1 = await checkout.createCheckoutSession(buyer1.id, undefined, [mediaA.id, mediaB.id], randomUUID());
    const order2 = await checkout.createCheckoutSession(buyer2.id, undefined, [mediaB.id, mediaA.id], randomUUID());

    const results = await Promise.allSettled([
      fulfillment.fulfillOrder(order1.orderId, `race-multi-1-${randomUUID()}`),
      fulfillment.fulfillOrder(order2.orderId, `race-multi-2-${randomUUID()}`),
    ]);

    for (const result of results) {
      expect(result.status).toBe('fulfilled');
    }

    const [updatedOrder1, updatedOrder2] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order1.orderId } }),
      prisma.order.findUniqueOrThrow({ where: { id: order2.orderId } }),
    ]);
    expect(updatedOrder1.status).toBe('COMPLETED');
    expect(updatedOrder2.status).toBe('COMPLETED');

    const [sellerASales, sellerBSales] = await Promise.all([
      prisma.transaction.findMany({ where: { userId: sellerA.id, type: 'SALE' } }),
      prisma.transaction.findMany({ where: { userId: sellerB.id, type: 'SALE' } }),
    ]);
    expect(sellerASales).toHaveLength(2);
    expect(sellerBSales).toHaveLength(2);

    const [updatedSellerA, updatedSellerB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: sellerA.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: sellerB.id } }),
    ]);
    expect(updatedSellerA.balance).toBe(sellerASales.reduce((sum, t) => sum + t.amount, 0));
    expect(updatedSellerB.balance).toBe(sellerBSales.reduce((sum, t) => sum + t.amount, 0));
  });

  it('rollback after an injected ledger failure: order, purchase, and balance are all left unaffected', async () => {
    const photographer = await createPhotographer();
    const buyer = await createBuyer();
    const session = await createSession(photographer.id);
    const media = await createPublishedMedia(photographer.id, session.id);
    const { checkout, fulfillment } = makeServices();

    const order = await checkout.createCheckoutSession(buyer.id, undefined, [media.id], randomUUID());

    const recordSaleSpy = vi.spyOn(ledgerRepository, 'recordSale').mockImplementationOnce(async () => {
      throw new Error('Injected ledger failure');
    });

    await expect(
      fulfillment.fulfillOrder(order.orderId, `race-ledger-fail-${randomUUID()}`),
    ).rejects.toThrow('Injected ledger failure');

    expect(recordSaleSpy).toHaveBeenCalledTimes(1);

    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } });
    expect(updatedOrder.status).toBe('PENDING');

    const purchases = await prisma.purchase.findMany({ where: { buyerId: buyer.id, mediaItemId: media.id } });
    expect(purchases).toHaveLength(0);

    const saleTransactions = await prisma.transaction.findMany({ where: { userId: photographer.id, type: 'SALE' } });
    expect(saleTransactions).toHaveLength(0);

    const updatedPhotographer = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(updatedPhotographer.balance).toBe(0);
  });
});
