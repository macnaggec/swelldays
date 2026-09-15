import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PurchaseFulfillmentService } from './PurchaseFulfillmentService';
import type { OrderWithItems } from 'server/repositories/OrderRepository';
import { ConflictError } from 'server/errors';
import type { PaidLineCandidate } from 'server/repositories/FulfillmentRepository';

const orders = { findOrderByExternalId: vi.fn(), findOrderById: vi.fn(), createOrder: vi.fn(),
  findOrderByBuyerAndClientRequestId: vi.fn(), findPendingMediaItemIds: vi.fn(), markOrderFailed: vi.fn(),
  saveGuestEmail: vi.fn(), saveCheckoutSessionUrl: vi.fn() };
const fulfillment = { commitFulfillment: vi.fn() };
const cloudinary = { tryGeneratePermanentPreviewUrl: vi.fn() };
const service = new PurchaseFulfillmentService(orders, fulfillment, cloudinary);
const line = { id: 'oi-1', mediaItemId: 'media-1', unitAmountCents: 1000, currency: 'USD',
  sellerId: 'seller-1', feePolicyVersion: 'standard-20-v1', platformFeeAmount: 200,
  sellerEarningsAmount: 800, deliverablePublicId: 'asset-1', deliverableType: 'PHOTO' as const };
const order: OrderWithItems = { id: 'order-1', buyerId: 'buyer-1', guestEmail: null, externalOrderId: null,
  totalAmount: 1000, status: 'PENDING', checkoutSessionUrl: null, items: [line] };

beforeEach(() => {
  vi.clearAllMocks(); orders.findOrderByExternalId.mockResolvedValue(null); orders.findOrderById.mockResolvedValue(order);
  fulfillment.commitFulfillment.mockResolvedValue({ applied: true, paidLineIds: ['paid-1'], hasExceptions: false });
  cloudinary.tryGeneratePermanentPreviewUrl.mockReturnValue('https://example.com/preview');
});

describe('PurchaseFulfillmentService', () => {
  it('carries the exact payment attempt and immutable line facts into fulfillment', async () => {
    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1')).resolves.toEqual({
      type: 'fulfilled', paidLineIds: ['paid-1'],
    });
    expect(fulfillment.commitFulfillment).toHaveBeenCalledWith({ orderId: 'order-1', paymentAttemptId: 'attempt-1',
      buyerId: 'buyer-1', externalOrderId: 'external-1', paidLines: [expect.objectContaining({ orderItemId: 'oi-1',
        sellerId: 'seller-1', amountPaid: 1000, platformFee: 200, sellerEarnings: 800,
        currency: 'USD', deliverablePublicId: 'asset-1', deliverableType: 'PHOTO' })] });
  });

  it('returns visible fulfillment exceptions with durable paid-line IDs', async () => {
    fulfillment.commitFulfillment.mockResolvedValue({ applied: true, paidLineIds: ['paid-2'], hasExceptions: true });
    await expect(service.fulfillOrder('order-1', 'external-2', 'attempt-2')).resolves.toEqual({
      type: 'fulfilled-with-exceptions', paidLineIds: ['paid-2'],
    });
  });

  it('does not commit an unknown or already externally fulfilled order', async () => {
    orders.findOrderByExternalId.mockResolvedValueOnce({ id: 'existing' });
    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1')).resolves.toEqual({ type: 'completed-duplicate' });
    orders.findOrderByExternalId.mockResolvedValueOnce(null); orders.findOrderById.mockResolvedValueOnce(null);
    await expect(service.fulfillOrder('missing', 'external-2', 'attempt-2')).resolves.toEqual({ type: 'unknown-order' });
    expect(fulfillment.commitFulfillment).not.toHaveBeenCalled();
  });

  it('returns order-not-pending for a transaction loser', async () => {
    fulfillment.commitFulfillment.mockResolvedValue({ applied: false });
    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1')).resolves.toEqual({ type: 'order-not-pending' });
  });

  it('rejects incomplete or non-conserving historical line economics', async () => {
    orders.findOrderById.mockResolvedValueOnce({ ...order, items: [{ ...line, sellerEarningsAmount: null }] });
    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1')).rejects.toThrow('oi-1');
    orders.findOrderById.mockResolvedValueOnce({ ...order, items: [{ ...line, sellerEarningsAmount: 799 }] });
    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1')).rejects.toThrow('oi-1');
    expect(fulfillment.commitFulfillment).not.toHaveBeenCalled();
  });

  it('preserves guest identity and creates a random download token', async () => {
    orders.findOrderById.mockResolvedValue({ ...order, buyerId: null, guestEmail: 'guest@example.com' });

    await service.fulfillOrder('order-1', 'external-1', 'attempt-1');

    const payload = fulfillment.commitFulfillment.mock.calls[0]![0];
    expect(payload).toMatchObject({ buyerId: null, paymentAttemptId: 'attempt-1' });
    expect(payload.paidLines[0]).toMatchObject({ buyerId: null, guestEmail: 'guest@example.com' });
    expect(payload.paidLines[0].downloadToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps each immutable line and seller separate in a mixed order', async () => {
    orders.findOrderById.mockResolvedValue({ ...order, totalAmount: 3000, items: [
      { ...line, id: 'oi-1', mediaItemId: 'media-1', sellerId: 'seller-b' },
      { ...line, id: 'oi-2', mediaItemId: 'media-2', sellerId: 'seller-a', unitAmountCents: 2000,
        platformFeeAmount: 400, sellerEarningsAmount: 1600 },
    ] });

    await service.fulfillOrder('order-1', 'external-1', 'attempt-1');

    expect(fulfillment.commitFulfillment.mock.calls[0]![0].paidLines).toEqual([
      expect.objectContaining({ orderItemId: 'oi-1', mediaItemId: 'media-1', sellerId: 'seller-b',
        amountPaid: 1000, platformFee: 200, sellerEarnings: 800 }),
      expect.objectContaining({ orderItemId: 'oi-2', mediaItemId: 'media-2', sellerId: 'seller-a',
        amountPaid: 2000, platformFee: 400, sellerEarnings: 1600 }),
    ]);
  });

  it('uses each line fee snapshot rather than current provider configuration', async () => {
    orders.findOrderById.mockResolvedValue({ ...order, totalAmount: 2000, items: [
      { ...line, id: 'oi-paddle', mediaItemId: 'media-paddle', feePolicyVersion: 'paddle-50c-30-v1',
        platformFeeAmount: 350, sellerEarningsAmount: 650 },
      { ...line, id: 'oi-standard', mediaItemId: 'media-standard' },
    ] });

    await service.fulfillOrder('order-1', 'external-1', 'attempt-1');

    const paidLines = fulfillment.commitFulfillment.mock.calls[0]![0].paidLines;
    expect(paidLines.find((paidLine: PaidLineCandidate) => paidLine.mediaItemId === 'media-paddle'))
      .toMatchObject({ platformFee: 350, sellerEarnings: 650 });
    expect(paidLines.find((paidLine: PaidLineCandidate) => paidLine.mediaItemId === 'media-standard'))
      .toMatchObject({ platformFee: 200, sellerEarnings: 800 });
  });

  it('maps a unique-identity conflict to completed-duplicate', async () => {
    fulfillment.commitFulfillment.mockRejectedValue(new ConflictError('external identity already used'));

    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1'))
      .resolves.toEqual({ type: 'completed-duplicate' });
  });

  it('propagates non-conflict fulfillment failures', async () => {
    fulfillment.commitFulfillment.mockRejectedValue(new Error('database unavailable'));

    await expect(service.fulfillOrder('order-1', 'external-1', 'attempt-1'))
      .rejects.toThrow('database unavailable');
  });
});
