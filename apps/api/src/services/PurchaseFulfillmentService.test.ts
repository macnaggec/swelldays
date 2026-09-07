import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PurchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';
import type { OrderWithItems } from 'server/repositories/OrderRepository';
import type { PersistedOrderLine } from 'server/domain/OrderEconomics';
import type { FulfillPurchaseData, FulfillmentPayload } from 'server/repositories/FulfillmentRepository';
import { logger } from 'server/lib/logger';

// ---------------------------------------------------------------------------
// Inline mocks — no vi.mock() needed with constructor injection
// ---------------------------------------------------------------------------

const mockFulfillment = {
  commitFulfillment: vi.fn().mockResolvedValue({ applied: true, skippedMediaItemIds: [] }),
};

const mockOrders = {
  findOrderByExternalId: vi.fn(),
  findOrderById: vi.fn(),
  createOrder: vi.fn(),
  markOrderFailed: vi.fn(),
};

const mockCloudinary = {
  tryGeneratePermanentPreviewUrl: vi.fn().mockReturnValue('https://res.cloudinary.com/preview'),
};

const service = new PurchaseFulfillmentService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock objects in test
  mockOrders as any,
  mockFulfillment,
  mockCloudinary,
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockFulfillment.commitFulfillment.mockResolvedValue({ applied: true, skippedMediaItemIds: [] });
  mockCloudinary.tryGeneratePermanentPreviewUrl.mockReturnValue('https://res.cloudinary.com/preview');
});

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeLine(overrides: Partial<PersistedOrderLine> = {}): PersistedOrderLine {
  return {
    id: 'oi-1',
    mediaItemId: 'media-1',
    unitAmountCents: 1000,
    currency: 'USD',
    sellerId: 'photographer-1',
    feePolicyVersion: 'standard-20-v1',
    platformFeeAmount: 200,
    sellerEarningsAmount: 800,
    deliverablePublicId: 'waves/photo-001',
    deliverableType: 'PHOTO',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: 'order-1',
    buyerId: 'buyer-1',
    guestEmail: null,
    externalOrderId: null,
    totalAmount: 1000,
    status: 'PENDING',
    checkoutSessionUrl: null,
    items: [makeLine()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// fulfillOrder
// ---------------------------------------------------------------------------

describe('PurchaseFulfillmentService.fulfillOrder', () => {
  const ORDER_ID = 'order-1';
  const EXTERNAL_ID = 'CC-ILRAJE1Q';

  function setupHappyPath(order: OrderWithItems = makeOrder()) {
    mockOrders.findOrderByExternalId.mockResolvedValue(null);
    mockOrders.findOrderById.mockResolvedValue(order);
  }

  // -------------------------------------------------------------------------
  // Idempotency
  // -------------------------------------------------------------------------

  it('exits early without writing if externalOrderId already recorded', async () => {
    mockOrders.findOrderByExternalId.mockResolvedValue({ id: ORDER_ID });

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    expect(mockFulfillment.commitFulfillment).not.toHaveBeenCalled();
  });

  it('exits early without writing if the order does not exist', async () => {
    mockOrders.findOrderByExternalId.mockResolvedValue(null);
    mockOrders.findOrderById.mockResolvedValue(null);

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    expect(mockFulfillment.commitFulfillment).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Purchase data written from the order line, not a catalog read
  // -------------------------------------------------------------------------

  it('writes one purchase entry per media item with correct fields', async () => {
    setupHappyPath(makeOrder({ items: [makeLine({ unitAmountCents: 1000, platformFeeAmount: 200, sellerEarningsAmount: 800 })] }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    expect(payload.orderId).toBe(ORDER_ID);
    expect(payload.buyerId).toBe('buyer-1');
    expect(payload.externalOrderId).toBe(EXTERNAL_ID);
    expect(payload.purchases).toHaveLength(1);
    expect(payload.purchases[0]).toMatchObject<Partial<FulfillPurchaseData>>({
      mediaItemId: 'media-1',
      buyerId: 'buyer-1',
      amountPaid: 1000,
      platformFee: 200,
      photographerEarned: 800,
      previewUrl: 'https://res.cloudinary.com/preview',
    });
    expect(payload.purchases[0]?.downloadToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes guestEmail to purchase and null buyerId for guest orders', async () => {
    setupHappyPath(makeOrder({ buyerId: null, guestEmail: 'guest@example.com' }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    expect(payload.buyerId).toBeNull();
    expect(payload.purchases[0]).toMatchObject({ buyerId: null, guestEmail: 'guest@example.com' });
  });

  // -------------------------------------------------------------------------
  // Earnings credited from the line's sellerId
  // -------------------------------------------------------------------------

  it('credits aggregated earnings when two items share the same seller', async () => {
    // 200 + 1600 = 1800
    setupHappyPath(makeOrder({
      items: [
        makeLine({ id: 'oi-1', mediaItemId: 'media-1', unitAmountCents: 1000, platformFeeAmount: 200, sellerEarningsAmount: 800, sellerId: 'p-1' }),
        makeLine({ id: 'oi-2', mediaItemId: 'media-2', unitAmountCents: 2000, platformFeeAmount: 400, sellerEarningsAmount: 1600, sellerId: 'p-1' }),
      ],
    }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    expect(payload.earnings).toHaveLength(1);
    expect(payload.earnings[0]).toMatchObject({ photographerId: 'p-1', amount: 2400 });
  });

  it('credits separate earnings when sellers differ', async () => {
    setupHappyPath(makeOrder({
      items: [
        makeLine({ id: 'oi-1', mediaItemId: 'media-1', unitAmountCents: 1000, platformFeeAmount: 200, sellerEarningsAmount: 800, sellerId: 'p-1' }),
        makeLine({ id: 'oi-2', mediaItemId: 'media-2', unitAmountCents: 2000, platformFeeAmount: 400, sellerEarningsAmount: 1600, sellerId: 'p-2' }),
      ],
    }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    const ids = payload.earnings.map((e) => e.photographerId).sort();
    expect(ids).toEqual(['p-1', 'p-2']);
  });

  it("credits earnings under the line's sellerId, not any catalog lookup", async () => {
    setupHappyPath(makeOrder({ items: [makeLine({ sellerId: 'seller-from-line', sellerEarningsAmount: 800 })] }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    expect(payload.earnings).toEqual([{ photographerId: 'seller-from-line', amount: 800 }]);
  });

  // -------------------------------------------------------------------------
  // Race-condition idempotency: ConflictError from commitFulfillment
  // Guards the catch block that makes the DB unique-constraint race safe.
  // -------------------------------------------------------------------------

  it('swallows ConflictError from commitFulfillment — treats it as idempotent success', async () => {
    const { ConflictError } = await import('server/errors');
    setupHappyPath();
    mockFulfillment.commitFulfillment.mockRejectedValue(
      new ConflictError('external_order_id already exists'),
    );

    await expect(service.fulfillOrder(ORDER_ID, EXTERNAL_ID)).resolves.toBeUndefined();
  });

  it('treats commitFulfillment resolving { applied: false } as idempotent success', async () => {
    setupHappyPath();
    mockFulfillment.commitFulfillment.mockResolvedValue({ applied: false });

    await expect(service.fulfillOrder(ORDER_ID, EXTERNAL_ID)).resolves.toBeUndefined();
  });

  it('rethrows non-ConflictError from commitFulfillment — does not swallow real failures', async () => {
    setupHappyPath();
    const boom = new Error('DB connection lost');
    mockFulfillment.commitFulfillment.mockRejectedValue(boom);

    await expect(service.fulfillOrder(ORDER_ID, EXTERNAL_ID)).rejects.toThrow('DB connection lost');
  });

  it('logs a warning naming the skipped media items when commitFulfillment reports a collision', async () => {
    setupHappyPath();
    mockFulfillment.commitFulfillment.mockResolvedValue({
      applied: true,
      skippedMediaItemIds: ['media-1'],
    });
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped duplicate Purchase'),
      { orderId: ORDER_ID, mediaItemIds: ['media-1'] },
    );
    warnSpy.mockRestore();
  });

  it('does not log when commitFulfillment reports no skipped items', async () => {
    setupHappyPath();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // R01: economics and the deliverable come from the immutable order line
  // -------------------------------------------------------------------------

  it('economics survive a catalog price edit — the line, not any media repository, decides what gets paid', async () => {
    setupHappyPath(makeOrder({ items: [makeLine({ unitAmountCents: 1000, platformFeeAmount: 200, sellerEarningsAmount: 800 })] }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    expect(payload.purchases[0]).toMatchObject({ amountPaid: 1000, platformFee: 200, photographerEarned: 800 });
  });

  it("the line's fee policy wins over process configuration", async () => {
    setupHappyPath(makeOrder({
      items: [
        makeLine({
          id: 'oi-paddle',
          mediaItemId: 'media-paddle',
          feePolicyVersion: 'paddle-50c-30-v1',
          unitAmountCents: 1000,
          platformFeeAmount: 350,
          sellerEarningsAmount: 650,
        }),
        makeLine({
          id: 'oi-standard',
          mediaItemId: 'media-standard',
          feePolicyVersion: 'standard-20-v1',
          unitAmountCents: 1000,
          platformFeeAmount: 200,
          sellerEarningsAmount: 800,
        }),
      ],
    }));

    await service.fulfillOrder(ORDER_ID, EXTERNAL_ID);

    const payload = mockFulfillment.commitFulfillment.mock.calls[0]![0] as FulfillmentPayload;
    const paddlePurchase = payload.purchases.find((p) => p.mediaItemId === 'media-paddle');
    const standardPurchase = payload.purchases.find((p) => p.mediaItemId === 'media-standard');
    expect(paddlePurchase).toMatchObject({ platformFee: 350, photographerEarned: 650 });
    expect(standardPurchase).toMatchObject({ platformFee: 200, photographerEarned: 800 });
  });

  it('an incomplete line refuses to pay — a null field rejects and never commits', async () => {
    setupHappyPath(makeOrder({ items: [makeLine({ id: 'oi-1', sellerEarningsAmount: null })] }));

    await expect(service.fulfillOrder(ORDER_ID, EXTERNAL_ID)).rejects.toThrow('oi-1');
    expect(mockFulfillment.commitFulfillment).not.toHaveBeenCalled();
  });

  it('a non-conserving line refuses to pay', async () => {
    setupHappyPath(makeOrder({
      items: [makeLine({ id: 'oi-1', unitAmountCents: 1000, platformFeeAmount: 200, sellerEarningsAmount: 799 })],
    }));

    await expect(service.fulfillOrder(ORDER_ID, EXTERNAL_ID)).rejects.toThrow('oi-1');
    expect(mockFulfillment.commitFulfillment).not.toHaveBeenCalled();
  });
});
