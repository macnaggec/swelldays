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
  createAttempt: vi.fn(),
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
  mockPayment as Pick<IPaymentService, 'createAttempt'>,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockTransaction.mockImplementation((fn: any) => fn(mockTx));
  mockTx.$executeRaw.mockResolvedValue(undefined);
  mockTx.purchase.findMany.mockResolvedValue([]);
  mockTx.orderItem.findMany.mockResolvedValue([]);
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

function makeOrder(): OrderWithItems {
  return {
    id: 'order-uuid-1',
    buyerId: 'buyer-1',
    items: [{ id: 'oi-1', mediaItemId: 'media-1' }],
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
    mockOrders.saveCheckoutSessionUrl.mockResolvedValue(undefined);
    mockPayment.createAttempt.mockResolvedValue({
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
    const paymentCallOrder = mockPayment.createAttempt.mock.invocationCallOrder[0];

    expect(orderCallOrder).toBeLessThan(paymentCallOrder!);
  });

  it('passes totalCents derived from DB prices — not from client input', async () => {
    const item1 = makeMediaItem({ id: 'media-1', price: 1550 });
    const item2 = makeMediaItem({ id: 'media-2', price: 950 });

    setupHappyPath([item1, item2]);

    await service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-2'], CLIENT_REQUEST_ID);

    // 1550 + 950 = 2500 cents
    expect(mockPayment.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 2500 }),
    );
  });

  it('skips duplicate-purchase check for guest checkout (buyerId = null)', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
    mockPayment.createAttempt.mockResolvedValue({
      checkoutUrl: 'https://pay.cryptocloud.plus/guest-invoice',
      expiresAt: null,
    });

    await service.createCheckoutSession(null, 'guest@example.com', ITEM_IDS, CLIENT_REQUEST_ID);

    expect(mockPurchases.findPurchasedItemIds).not.toHaveBeenCalled();
    expect(mockOrders.createOrder).toHaveBeenCalledOnce();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  // ---
  // Idempotency
  // ---

  it('returns the cached checkout session on a retried call with the same clientRequestId', async () => {
    setupHappyPath();

    const first = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue({
      ...makeOrder(),
      status: 'PENDING',
      checkoutSessionUrl: first.checkoutUrl,
    });

    const second = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(second).toEqual(first);
    expect(mockOrders.createOrder).toHaveBeenCalledOnce();
    expect(mockPayment.createAttempt).toHaveBeenCalledOnce();
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

    const result = await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    expect(result.checkoutUrl).toBe('https://pay.cryptocloud.plus/winning-invoice');
    expect(mockPayment.createAttempt).not.toHaveBeenCalled();
  });

  it('retries until the winning order\'s checkoutSessionUrl becomes available, instead of throwing immediately', async () => {
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

    const attempt = service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    await expect(attempt).rejects.toThrow(BadRequestError);
    await expect(attempt).rejects.toThrow('failed — please retry with a new request');
  });

  it('throws a distinct error (not the raw ConflictError) when retries are exhausted and the order is still unresolved', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockOrders.findOrderByBuyerAndClientRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ...makeOrder(), status: 'PENDING', checkoutSessionUrl: null });
    mockOrders.createOrder.mockRejectedValue(new ConflictError('buyer_id, client_request_id already exists'));

    const attempt = service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    await expect(attempt).rejects.toThrow(BadRequestError);
    await expect(attempt).rejects.toThrow('still being processed');
  });

  it('creates a new order when the clientRequestId differs from any prior attempt', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, 'client-request-uuid-a');
    await service.createCheckoutSession(BUYER_ID, undefined, ['media-2'], 'client-request-uuid-b');

    expect(mockOrders.createOrder).toHaveBeenCalledTimes(2);
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
  });

  it('throws BadRequestError when buyer already has a pending order for an item', async () => {
    mockMedia.findByIdsForCheckout.mockResolvedValue([makeMediaItem()]);
    mockTx.orderItem.findMany.mockResolvedValue([{ mediaItemId: 'media-1' }]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items already have a pending order',
    );
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
    mockTx.orderItem.findMany.mockResolvedValue([{ mediaItemId: 'media-1' }]);

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
    mockPayment.createAttempt.mockRejectedValue(new Error('CryptoCloud down'));

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

  it('runs the snapshot read inside the buyer transaction for the buyer path, and without one for the guest path', async () => {
    setupHappyPath();
    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID);

    mockPayment.createAttempt.mockResolvedValue({
      checkoutUrl: 'https://pay.cryptocloud.plus/guest-invoice',
      expiresAt: null,
    });
    await service.createCheckoutSession(null, 'guest@example.com', ITEM_IDS, 'client-request-guest');

    expect(mockMedia.findByIdsForCheckout).toHaveBeenNthCalledWith(1, ITEM_IDS, mockTx);
    expect(mockMedia.findByIdsForCheckout).toHaveBeenNthCalledWith(2, ITEM_IDS, undefined);
  });

  it('records the Paddle policy on the line for a Paddle-configured service', async () => {
    const paddleService = new CheckoutService(
      mockOrders as unknown as IOrderRepository,
      mockMedia as unknown as IMediaRepository,
      mockPurchases as unknown as IPurchaseRepository,
      mockPayment as Pick<IPaymentService, 'createAttempt'>,
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
