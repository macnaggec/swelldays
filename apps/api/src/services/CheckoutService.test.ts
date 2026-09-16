import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('server/db', () => ({
  prisma: { $transaction: vi.fn() },
}));

import { prisma } from 'server/db';
import { CheckoutService } from 'server/services/CheckoutService';
import type { IOrderRepository, OrderWithItems, CreateOrderData } from 'server/repositories/OrderRepository';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import type { IPurchaseRepository, PurchaseWithMedia } from 'server/repositories/PurchaseRepository';
import type { IPaymentService } from 'server/services/PaymentService';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { BadRequestError, BadGatewayError, ForbiddenError, ConflictError } from 'server/errors';

// ---------------------------------------------------------------------------
// Inline mocks via constructor injection, plus one vi.mock('server/db') for
// the buyer-locked order-creation path, which owns its own prisma.$transaction
// (see CheckoutService.createOrderForBuyer).
// ---------------------------------------------------------------------------

const mockOrders = {
  createOrder: vi.fn(),
  markOrderFailed: vi.fn(),
  findOrderById: vi.fn(),
  findOrderByBuyerAndClientRequestId: vi.fn(),
  saveCheckoutSessionUrl: vi.fn(),
};

const mockMedia = {
  findByIdsForCheckout: vi.fn(),
};

const mockPurchases = {
  findByBuyer: vi.fn(),
  findByBuyerAndMedia: vi.fn(),
  findByDownloadToken: vi.fn(),
  findByIdAndOrder: vi.fn(),
  findPurchasedItemIds: vi.fn(),
};

const mockPayment = {
  prepareAttempt: vi.fn(),
  openPreparedAttempt: vi.fn(),
  resumeAttempt: vi.fn(),
};

const mockCloudinary = {
  generateSignedDownload: vi.fn(),
};

const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;

const mockTx = {
  $executeRaw: vi.fn(),
  purchase: { findMany: vi.fn() },
  orderItem: { findMany: vi.fn() },
};

const service = new CheckoutService(
  mockOrders as unknown as IOrderRepository,
  mockMedia as unknown as IMediaRepository,
  mockPurchases as unknown as IPurchaseRepository,
  mockPayment as Pick<IPaymentService, 'prepareAttempt' | 'openPreparedAttempt' | 'resumeAttempt'>,
  mockCloudinary as unknown as ICloudinaryService,
  'http://localhost:3000',
  'cryptocloud',
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Mirrors OrderRepository.createOrder: derives totalAmount from the snapshot lines it receives and echoes them back with generated ids. */
function defaultCreateOrderImplementation(data: CreateOrderData) {
  return Promise.resolve({
    id: 'order-uuid-1',
    buyerId: data.buyerId,
    guestEmail: data.guestEmail ?? null,
    externalOrderId: null,
    totalAmount: data.items.reduce((sum, item) => sum + item.unitAmountCents, 0),
    status: 'PENDING',
    checkoutSessionUrl: null,
    items: data.items.map((item, i) => ({ id: `oi-${i + 1}`, ...item })),
  } as unknown as OrderWithItems);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
  mockOrders.createOrder.mockImplementation(defaultCreateOrderImplementation);
  mockTransaction.mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
  mockTx.$executeRaw.mockResolvedValue(undefined);
  mockTx.purchase.findMany.mockResolvedValue([]);
  mockTx.orderItem.findMany.mockResolvedValue([]);
  mockPayment.prepareAttempt.mockResolvedValue({ id: 'attempt-1' });
  mockPayment.resumeAttempt.mockResolvedValue({
    type: 'ready', checkoutUrl: 'https://pay.cryptocloud.plus/mock-invoice', expiresAt: null,
  });
});

// ---------------------------------------------------------------------------
// Factories — minimal valid shapes the mocks need to return
// ---------------------------------------------------------------------------

function makeMediaItem(overrides: Partial<{
  id: string;
  status: string;
  price: number;
  photographerId: string;
  cloudinaryPublicId: string;
  type: string;
}> = {}) {
  return {
    id: 'media-1',
    status: 'PUBLISHED',
    price: 1000,
    photographerId: 'photographer-1',
    cloudinaryPublicId: 'waves/photo-001',
    type: 'PHOTO',
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderWithItems> = {}): OrderWithItems {
  return {
    id: 'order-uuid-1',
    buyerId: 'buyer-1',
    status: 'PENDING',
    items: [{ id: 'oi-1', mediaItemId: 'media-1' }],
    ...overrides,
  } as unknown as OrderWithItems;
}

function makePurchase(overrides: Partial<PurchaseWithMedia> = {}): PurchaseWithMedia {
  return {
    id: 'purchase-1',
    purchasedAt: new Date('2026-01-01'),
    amountPaid: 1000,
    previewUrl: 'https://res.cloudinary.com/preview.jpg',
    mediaItem: {
      id: 'media-1',
      type: 'PHOTO',
      cloudinaryPublicId: 'swelldays/photo-001',
      thumbnailUrl: 'https://res.cloudinary.com/thumb.jpg',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

describe('CheckoutService.createCheckoutSession', () => {
  const BUYER_ID = 'buyer-uuid-1';
  const ITEM_IDS = ['media-1'];
  const CLIENT_REQUEST_ID = 'client-request-uuid-1';

  function setupHappyPath(items = [makeMediaItem()]) {
    mockMedia.findByIdsForCheckout.mockResolvedValue(items);
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
    mockPayment.openPreparedAttempt.mockResolvedValue({
      type: 'ready',
      checkoutUrl: 'https://pay.cryptocloud.plus/mock-invoice',
      expiresAt: null,
    });
  }

  // ---
  // Happy path
  // ---

  it('returns checkoutUrl and orderId when cart is valid', async () => {
    setupHappyPath();

    const result = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(result.checkoutUrl).toBe('https://pay.cryptocloud.plus/mock-invoice');
    expect(result.orderId).toBe('order-uuid-1');
  });

  it('creates the order before calling the payment adapter', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    const orderCallOrder = mockOrders.createOrder.mock.invocationCallOrder[0];
    const paymentCallOrder = mockPayment.openPreparedAttempt.mock.invocationCallOrder[0];

    expect(orderCallOrder).toBeLessThan(paymentCallOrder!);
  });

  it('passes totalCents derived from DB prices — not from client input', async () => {
    const item1 = makeMediaItem({ id: 'media-1', price: 1550 });
    const item2 = makeMediaItem({ id: 'media-2', price: 950 });

    setupHappyPath([item1, item2]);

    await service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-2'], CLIENT_REQUEST_ID);

    // 1550 + 950 = 2500 cents
    expect(mockPayment.prepareAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 2500 }),
      mockTx,
    );
  });

  it('skips duplicate-purchase check for guest checkout (buyerId = null)', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
    mockPayment.openPreparedAttempt.mockResolvedValue({
      type: 'ready',
      checkoutUrl: 'https://pay.cryptocloud.plus/guest-invoice',
      expiresAt: null,
    });

    await service.createCheckoutSession(null, 'guest@example.com', ITEM_IDS, CLIENT_REQUEST_ID);

    expect(mockPurchases.findPurchasedItemIds).not.toHaveBeenCalled();
    expect(mockOrders.createOrder).toHaveBeenCalledOnce();
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  // ---
  // Idempotency
  // ---

  it('resumes from PaymentAttempt even when the legacy Order URL is absent', async () => {
    setupHappyPath();

    const first = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue({
      ...makeOrder(),
      status: 'PENDING',
      checkoutSessionUrl: null,
    });

    const second = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(second).toEqual(first);
    expect(mockOrders.createOrder).toHaveBeenCalledOnce();
    expect(mockPayment.openPreparedAttempt).toHaveBeenCalledOnce();
  });

  it('recovers from a concurrent duplicate-key race by returning the winning order\'s session', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...makeOrder(),
        status: 'PENDING',
        checkoutSessionUrl: 'https://pay.cryptocloud.plus/winning-invoice',
      });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));
    mockPayment.resumeAttempt.mockResolvedValue({
      type: 'ready', checkoutUrl: 'https://pay.cryptocloud.plus/winning-invoice', expiresAt: null,
    });

    const result = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(result.checkoutUrl).toBe('https://pay.cryptocloud.plus/winning-invoice');
    expect(mockPayment.openPreparedAttempt).not.toHaveBeenCalled();
  });

  it('retries until the winning PaymentAttempt becomes ready, instead of throwing immediately', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...makeOrder(), status: 'PENDING', checkoutSessionUrl: null })
      .mockResolvedValueOnce({
        ...makeOrder(),
        status: 'PENDING',
        checkoutSessionUrl: 'https://pay.cryptocloud.plus/winning-invoice',
      });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));
    mockPayment.resumeAttempt
      .mockResolvedValueOnce({ type: 'creating' })
      .mockResolvedValueOnce({
        type: 'ready', checkoutUrl: 'https://pay.cryptocloud.plus/winning-invoice', expiresAt: null,
      });

    const result = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(result.checkoutUrl).toBe('https://pay.cryptocloud.plus/winning-invoice');
    expect(mockOrders.findOrderByBuyerAndClientRequestId).toHaveBeenCalledTimes(3);
  });

  it('throws a distinct error (not the raw ConflictError) when the winning order ended up FAILED', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...makeOrder(), status: 'FAILED', checkoutSessionUrl: null });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));
    mockPayment.resumeAttempt.mockResolvedValue({
      type: 'definitively-failed', reason: 'provider-rejected',
    });

    const attempt = service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    await expect(attempt).rejects.toThrow(BadGatewayError);
    await expect(attempt).rejects.toThrow('retry with a new request');
  });

  it('throws a distinct error (not the raw ConflictError) when retries are exhausted and the order is still unresolved', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...makeOrder(), status: 'PENDING', checkoutSessionUrl: null });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));
    mockPayment.resumeAttempt.mockResolvedValue({ type: 'creating' });

    const attempt = service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    await expect(attempt).rejects.toThrow('still being created');
  });

  it('creates a new order when the clientRequestId differs from any prior attempt', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, 'client-request-uuid-a');
    await service.createCheckoutSession(BUYER_ID, undefined, ['media-2'], 'client-request-uuid-b');

    expect(mockOrders.createOrder).toHaveBeenCalledTimes(2);
  });

  it('never repeats provider creation when a cached attempt is unknown', async () => {
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue({
      ...makeOrder(), status: 'PENDING', checkoutSessionUrl: null,
    });
    mockPayment.resumeAttempt.mockResolvedValue({ type: 'unknown', reason: 'provider-timeout' });
    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID))
      .rejects.toThrow('outcome is unknown');
    expect(mockPayment.openPreparedAttempt).not.toHaveBeenCalled();
  });

  it('rejects a retried call under the same clientRequestId if the item set has changed', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue({
      ...makeOrder(),
      status: 'PENDING',
      checkoutSessionUrl: 'https://pay.cryptocloud.plus/mock-invoice',
    });

    await expect(
      service.createCheckoutSession(BUYER_ID, undefined, ['media-2'], CLIENT_REQUEST_ID),
    ).rejects.toThrow('already used for a different set of items');
  });

  it('accepts a retried call under the same clientRequestId when the item set matches, regardless of array order', async () => {
    const item1 = makeMediaItem({ id: 'media-1' });
    const item2 = makeMediaItem({ id: 'media-2' });
    setupHappyPath([item1, item2]);

    const first = await service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-2'], CLIENT_REQUEST_ID);

    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue({
      ...makeOrder(),
      status: 'PENDING',
      checkoutSessionUrl: first.checkoutUrl,
      items: [
        { id: 'oi-1', mediaItemId: 'media-1' },
        { id: 'oi-2', mediaItemId: 'media-2' },
      ],
    });

    const second = await service.createCheckoutSession(BUYER_ID, undefined, ['media-2', 'media-1'], CLIENT_REQUEST_ID);

    expect(second).toEqual(first);
  });

  it('rejects the raced session if the winning order\'s item set does not match this request\'s items', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...makeOrder(),
        status: 'PENDING',
        checkoutSessionUrl: 'https://pay.cryptocloud.plus/winning-invoice',
        items: [{ id: 'oi-1', mediaItemId: 'media-DIFFERENT' }],
      });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));

    await expect(
      service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID),
    ).rejects.toThrow('already used for a different set of items');
  });

  // ---
  // Validation failures
  // ---

  it('throws BadRequestError when cart is empty', async () => {
    await expect(service.createCheckoutSession(BUYER_ID, undefined, [], CLIENT_REQUEST_ID)).rejects.toThrow(BadRequestError);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, [], CLIENT_REQUEST_ID)).rejects.toThrow('Cart is empty');
  });

  it('throws BadRequestError when an item id does not exist in DB', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);

    await expect(
      service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-UNKNOWN'], CLIENT_REQUEST_ID),
    ).rejects.toThrow('One or more items not found');
  });

  it('throws BadRequestError when a cart item is not published', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem({ id: 'media-1', status: 'DRAFT' })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items are no longer available',
    );
  });

  it('throws BadRequestError when a cart item has null price', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem({ price: null as unknown as number })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items have no price set',
    );
  });

  it('throws BadRequestError when buyer tries to purchase their own media', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem({ photographerId: BUYER_ID })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'You cannot purchase your own media',
    );
  });

  it('throws BadRequestError when buyer already purchased an item', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.purchase.findMany.mockResolvedValue([{ mediaItemId: 'media-1' }]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items already purchased',
    );

    expect(mockTx.purchase.findMany).toHaveBeenCalledWith({
      where: { buyerId: BUYER_ID, mediaItemId: { in: ITEM_IDS }, revokedAt: null },
      select: { mediaItemId: true },
    });
  });

  it('throws BadRequestError when buyer already has a pending order for an item', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1', order: { paymentAttempts: [] },
    }]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items already have a pending order',
    );
  });

  it('keeps an old READY Paddle attempt with null expiry blocking', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1',
      order: { paymentAttempts: [{
        creationState: 'READY', environment: 'SANDBOX', providerTransactionId: 'txn-1',
        checkoutUrl: 'https://pay.example/txn-1', expiresAt: null,
      }] },
    }]);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID))
      .rejects.toThrow('Some items already have a pending order');
  });

  it('keeps an UNKNOWN attempt blocking a new client key', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1',
      order: { paymentAttempts: [{
        creationState: 'UNKNOWN', environment: null, providerTransactionId: null,
        checkoutUrl: null, expiresAt: null,
      }] },
    }]);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID))
      .rejects.toThrow('Some items already have a pending order');
  });

  it('does not let a definitively failed attempt block a fresh client key', async () => {
    setupHappyPath();
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1',
      order: { paymentAttempts: [{
        creationState: 'DEFINITIVELY_FAILED', environment: null, providerTransactionId: null,
        checkoutUrl: null, expiresAt: null,
      }] },
    }]);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID))
      .resolves.toEqual(expect.objectContaining({ orderId: 'order-uuid-1' }));
  });

  it('allows a new checkout after an authoritative provider expiry', async () => {
    setupHappyPath();
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1',
      order: { paymentAttempts: [{
        creationState: 'READY', environment: 'PRODUCTION', providerTransactionId: 'INV-1',
        checkoutUrl: 'https://pay.example/INV-1', expiresAt: new Date(0),
      }] },
    }]);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID))
      .resolves.toEqual(expect.objectContaining({ orderId: 'order-uuid-1' }));
  });

  // ---
  // R04: shared serialization protocol
  // ---

  it('acquires the advisory lock before the purchased/pending queries inside the transaction', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    const lockCallOrder = mockTx.$executeRaw.mock.invocationCallOrder[0]!;
    const purchaseCallOrder = mockTx.purchase.findMany.mock.invocationCallOrder[0]!;
    const pendingCallOrder = mockTx.orderItem.findMany.mock.invocationCallOrder[0]!;

    expect(lockCallOrder).toBeLessThan(purchaseCallOrder);
    expect(lockCallOrder).toBeLessThan(pendingCallOrder);
  });

  it('does not retry a BadRequestError from the pending check — the transaction body runs once', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.orderItem.findMany.mockResolvedValue([{
      mediaItemId: 'media-1', order: { paymentAttempts: [] },
    }]);

    await expect(
      service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID),
    ).rejects.toThrow(BadRequestError);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('excludes the current clientRequestId from the pending-order collision check — a same-key resubmission is not a pending-order conflict', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(mockTx.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          order: expect.objectContaining({ clientRequestId: { not: CLIENT_REQUEST_ID } }),
        }),
      }),
    );
  });

  // ---
  // Payment adapter failure
  // ---

  it('marks the order as FAILED and throws BadGatewayError when payment adapter rejects', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.markOrderFailed.mockResolvedValue({});
    mockPayment.openPreparedAttempt.mockResolvedValue({
      type: 'definitively-failed', reason: 'provider-rejected',
    });

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(BadGatewayError);
    expect(mockOrders.markOrderFailed).toHaveBeenCalledOnce();
  });

  // ---
  // R01: order lines snapshot economics at checkout
  // ---

  it('creates the order with a full economics snapshot line per cart item', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    const call = mockOrders.createOrder.mock.calls[0]![0] as CreateOrderData;
    expect(call.items).toHaveLength(1);
    const line = call.items[0]!;
    expect(line).toMatchObject({
      mediaItemId: 'media-1',
      unitAmountCents: 1000,
      currency: 'USD',
      sellerId: 'photographer-1',
      feePolicyVersion: 'standard-20-v1',
      deliverablePublicId: 'waves/photo-001',
      deliverableType: 'PHOTO',
    });
    expect(line.platformFeeAmount + line.sellerEarningsAmount).toBe(line.unitAmountCents);
  });

  it('prepares the payment attempt in the order transaction before provider I/O', async () => {
    setupHappyPath();
    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);
    expect(mockPayment.prepareAttempt).toHaveBeenCalledWith({
      orderId: 'order-uuid-1', totalCents: 1000,
    }, mockTx);
    expect(mockPayment.prepareAttempt.mock.invocationCallOrder[0])
      .toBeLessThan(mockPayment.openPreparedAttempt.mock.invocationCallOrder[0]!);
  });

  it('runs the snapshot read inside the buyer transaction for the buyer path, and without one for the guest path', async () => {
    setupHappyPath();
    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    mockPayment.openPreparedAttempt.mockResolvedValue({
      type: 'ready',
      checkoutUrl: 'https://pay.cryptocloud.plus/guest-invoice',
      expiresAt: null,
    });
    await service.createCheckoutSession(null, 'guest@example.com', ITEM_IDS, 'client-request-guest');

    expect(mockMedia.findByIdsForCheckout).toHaveBeenNthCalledWith(1, ITEM_IDS, mockTx);
    expect(mockMedia.findByIdsForCheckout).toHaveBeenNthCalledWith(2, ITEM_IDS, mockTx);
  });

  it('records the Paddle policy on the line for a Paddle-configured service', async () => {
    const paddleService = new CheckoutService(
      mockOrders as unknown as IOrderRepository,
      mockMedia as unknown as IMediaRepository,
      mockPurchases as unknown as IPurchaseRepository,
      mockPayment as Pick<IPaymentService, 'prepareAttempt' | 'openPreparedAttempt' | 'resumeAttempt'>,
      mockCloudinary as unknown as ICloudinaryService,
      'http://localhost:3000',
      'paddle',
    );
    setupHappyPath([makeMediaItem({ price: 1000 })]);

    await paddleService.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    const call = mockOrders.createOrder.mock.calls[0]![0] as CreateOrderData;
    expect(call.items[0]).toMatchObject({
      feePolicyVersion: 'paddle-50c-30-v1',
      platformFeeAmount: 350,
      sellerEarningsAmount: 650,
    });
  });
});

// ---------------------------------------------------------------------------
// getBuyerCheckoutStatus
// ---------------------------------------------------------------------------

describe('CheckoutService.getBuyerCheckoutStatus', () => {
  it('looks up by client request ID without creating anything', async () => {
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(makeOrder());

    await expect(service.getBuyerCheckoutStatus('buyer-1', { clientRequestId: 'request-1' }))
      .resolves.toEqual({
        state: 'ready', orderId: 'order-uuid-1', checkoutUrl: 'https://pay.cryptocloud.plus/mock-invoice',
      });
    expect(mockOrders.createOrder).not.toHaveBeenCalled();
    expect(mockPayment.openPreparedAttempt).not.toHaveBeenCalled();
  });

  it('does not reveal missing or foreign orders', async () => {
    mockOrders.findOrderById.mockResolvedValueOnce(null).mockResolvedValueOnce(makeOrder({ buyerId: 'buyer-2' }));
    await expect(service.getBuyerCheckoutStatus('buyer-1', { orderId: 'missing' }))
      .resolves.toEqual({ state: 'not-found' });
    await expect(service.getBuyerCheckoutStatus('buyer-1', { orderId: 'foreign' }))
      .resolves.toEqual({ state: 'not-found' });
    expect(mockPayment.resumeAttempt).not.toHaveBeenCalled();
  });

  it.each([
    ['COMPLETED', { state: 'paid', orderId: 'order-uuid-1' }],
    ['FAILED', { state: 'failed', orderId: 'order-uuid-1', reason: 'order-failed' }],
  ] as const)('maps terminal order state %s before consulting payment', async (status, expected) => {
    mockOrders.findOrderById.mockResolvedValue(makeOrder({ status }));
    await expect(service.getBuyerCheckoutStatus('buyer-1', { orderId: 'order-uuid-1' })).resolves.toEqual(expected);
    expect(mockPayment.resumeAttempt).not.toHaveBeenCalled();
  });

  it.each([
    [{ type: 'creating' }, { state: 'creating', orderId: 'order-uuid-1' }],
    [{ type: 'unknown', reason: 'provider-timeout' }, { state: 'unknown', orderId: 'order-uuid-1', reason: 'provider-timeout' }],
    [{ type: 'payment-received' }, { state: 'processing', orderId: 'order-uuid-1' }],
    [{ type: 'definitively-failed', reason: 'provider-rejected' }, { state: 'failed', orderId: 'order-uuid-1', reason: 'provider-rejected' }],
  ] as const)('maps payment outcome %#', async (outcome, expected) => {
    mockOrders.findOrderById.mockResolvedValue(makeOrder());
    mockPayment.resumeAttempt.mockResolvedValue(outcome);
    await expect(service.getBuyerCheckoutStatus('buyer-1', { orderId: 'order-uuid-1' })).resolves.toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// getPurchases
// ---------------------------------------------------------------------------

describe('CheckoutService.getPurchases', () => {
  it('returns mapped purchases for the buyer', async () => {
    const purchase = makePurchase();
    mockPurchases.findByBuyer.mockResolvedValue([purchase]);

    const result = await service.getPurchases('buyer-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'purchase-1',
      purchasedAt: purchase.purchasedAt,
      amountPaid: 1000,
      previewUrl: 'https://res.cloudinary.com/preview.jpg',
      mediaItem: {
        id: 'media-1',
        thumbnailUrl: 'https://res.cloudinary.com/thumb.jpg',
      },
    });
  });

  it('strips cloudinaryPublicId from the response', async () => {
    mockPurchases.findByBuyer.mockResolvedValue([makePurchase()]);

    const result = await service.getPurchases('buyer-1');

    expect(result[0]).not.toHaveProperty('mediaItem.cloudinaryPublicId');
  });

  it('returns an empty array when the buyer has no purchases', async () => {
    mockPurchases.findByBuyer.mockResolvedValue([]);

    const result = await service.getPurchases('buyer-1');

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// generateDownloadAccess
// ---------------------------------------------------------------------------

describe('CheckoutService.generateDownloadAccess', () => {
  it('returns a signed download URL when purchase exists', async () => {
    mockPurchases.findByBuyerAndMedia.mockResolvedValue(makePurchase());
    mockCloudinary.generateSignedDownload.mockResolvedValue({
      downloadUrl: 'https://res.cloudinary.com/signed',
      expiresAt: 9999999999,
    });

    const result = await service.generateDownloadAccess('buyer-1', 'media-1');

    expect(result.downloadUrl).toBe('https://res.cloudinary.com/signed');
  });

  it('throws ForbiddenError when purchase does not exist', async () => {
    mockPurchases.findByBuyerAndMedia.mockResolvedValue(null);

    await expect(service.generateDownloadAccess('buyer-1', 'media-1')).rejects.toThrow(ForbiddenError);
    await expect(service.generateDownloadAccess('buyer-1', 'media-1')).rejects.toThrow(
      'You have not purchased this item',
    );
  });
});
