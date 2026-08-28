import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckoutService } from 'server/services/CheckoutService';
import type { IOrderRepository, OrderWithItems } from 'server/repositories/OrderRepository';
import type { IMediaRepository } from 'server/repositories/MediaRepository';
import type { IPurchaseRepository, PurchaseWithMedia } from 'server/repositories/PurchaseRepository';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import type { ICloudinaryService } from 'server/services/CloudinaryService';
import { BadRequestError, BadGatewayError, ForbiddenError, ConflictError } from 'server/errors';

// ---------------------------------------------------------------------------
// Inline mocks — no vi.mock() needed with constructor injection
// ---------------------------------------------------------------------------

const mockOrders = {
  createOrder: vi.fn(),
  markOrderFailed: vi.fn(),
  findOrderByBuyerAndClientRequestId: vi.fn(),
  saveCheckoutSessionUrl: vi.fn(),
};

const mockMedia = {
  findByIds: vi.fn(),
};

const mockPurchases = {
  findByBuyer: vi.fn(),
  findByBuyerAndMedia: vi.fn(),
  findByDownloadToken: vi.fn(),
  findByIdAndOrder: vi.fn(),
  findPurchasedItemIds: vi.fn(),
};

const mockPayment = {
  createCheckoutSession: vi.fn(),
};

const mockCloudinary = {
  generateSignedDownload: vi.fn(),
};

const service = new CheckoutService(
  mockOrders as unknown as IOrderRepository,
  mockMedia as unknown as IMediaRepository,
  mockPurchases as unknown as IPurchaseRepository,
  mockPayment as unknown as PaymentAdapter,
  mockCloudinary as unknown as ICloudinaryService,
  'http://localhost:3000',
);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Factories — minimal valid shapes the mocks need to return
// ---------------------------------------------------------------------------

function makeMediaItem(overrides: Partial<{
  id: string;
  status: string;
  price: number;
  photographerId: string;
}> = {}) {
  return {
    id: 'media-1',
    status: 'PUBLISHED',
    price: 1000,
    photographerId: 'photographer-1',
    ...overrides,
  };
}

function makeOrder(): OrderWithItems {
  return { id: 'order-uuid-1', buyerId: 'buyer-1' } as unknown as OrderWithItems;
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
    mockMedia.findByIds.mockResolvedValue(items);
    mockPurchases.findPurchasedItemIds.mockResolvedValue([]);
    mockOrders.createOrder.mockResolvedValue(makeOrder());
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
    mockOrders.saveCheckoutSessionUrl.mockResolvedValue(undefined);
    mockPayment.createCheckoutSession.mockResolvedValue({
      checkoutUrl: 'https://pay.cryptocloud.plus/mock-invoice',
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
    const paymentCallOrder = mockPayment.createCheckoutSession.mock.invocationCallOrder[0];

    expect(orderCallOrder).toBeLessThan(paymentCallOrder!);
  });

  it('passes totalCents derived from DB prices — not from client input', async () => {
    const item1 = makeMediaItem({ id: 'media-1', price: 1550 });
    const item2 = makeMediaItem({ id: 'media-2', price: 950 });

    setupHappyPath([item1, item2]);

    await service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-2'], CLIENT_REQUEST_ID);

    // 1550 + 950 = 2500 cents
    expect(mockPayment.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 2500 }),
    );
  });

  it('skips duplicate-purchase check for guest checkout (buyerId = null)', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem()]);
    mockOrders.createOrder.mockResolvedValue(makeOrder());
    mockOrders.findOrderByBuyerAndClientRequestId.mockResolvedValue(null);
    mockPayment.createCheckoutSession.mockResolvedValue({
      checkoutUrl: 'https://pay.cryptocloud.plus/guest-invoice',
    });

    await service.createCheckoutSession(null, 'guest@example.com', ITEM_IDS, CLIENT_REQUEST_ID);

    expect(mockPurchases.findPurchasedItemIds).not.toHaveBeenCalled();
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
    expect(mockPayment.createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('recovers from a concurrent duplicate-key race by returning the winning order\'s session', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem()]);
    mockPurchases.findPurchasedItemIds.mockResolvedValue([]);
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
    expect(mockPayment.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('creates a new order when the clientRequestId differs from any prior attempt', async () => {
    setupHappyPath();

    await service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, 'client-request-uuid-a');
    await service.createCheckoutSession(BUYER_ID, undefined, ['media-2'], 'client-request-uuid-b');

    expect(mockOrders.createOrder).toHaveBeenCalledTimes(2);
  });

  // ---
  // Validation failures
  // ---

  it('throws BadRequestError when cart is empty', async () => {
    await expect(service.createCheckoutSession(BUYER_ID, undefined, [], CLIENT_REQUEST_ID)).rejects.toThrow(BadRequestError);
    await expect(service.createCheckoutSession(BUYER_ID, undefined, [], CLIENT_REQUEST_ID)).rejects.toThrow('Cart is empty');
  });

  it('throws BadRequestError when an item id does not exist in DB', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem()]);

    await expect(
      service.createCheckoutSession(BUYER_ID, undefined, ['media-1', 'media-UNKNOWN'], CLIENT_REQUEST_ID),
    ).rejects.toThrow('One or more items not found');
  });

  it('throws BadRequestError when a cart item is not published', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem({ id: 'media-1', status: 'DRAFT' })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items are no longer available',
    );
  });

  it('throws BadRequestError when a cart item has null price', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem({ price: null as unknown as number })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items have no price set',
    );
  });

  it('throws BadRequestError when buyer tries to purchase their own media', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem({ photographerId: BUYER_ID })]);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'You cannot purchase your own media',
    );
  });

  it('throws BadRequestError when buyer already purchased an item', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem()]);
    mockPurchases.findPurchasedItemIds.mockResolvedValue(['media-1']);

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(
      'Some items already purchased',
    );
  });

  // ---
  // Payment adapter failure
  // ---

  it('marks the order as FAILED and throws BadGatewayError when payment adapter rejects', async () => {
    mockMedia.findByIds.mockResolvedValue([makeMediaItem()]);
    mockPurchases.findPurchasedItemIds.mockResolvedValue([]);
    mockOrders.createOrder.mockResolvedValue(makeOrder());
    mockOrders.markOrderFailed.mockResolvedValue({});
    mockPayment.createCheckoutSession.mockRejectedValue(new Error('CryptoCloud down'));

    await expect(service.createCheckoutSession(BUYER_ID, undefined, ITEM_IDS, CLIENT_REQUEST_ID)).rejects.toThrow(BadGatewayError);
    expect(mockOrders.markOrderFailed).toHaveBeenCalledOnce();
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
