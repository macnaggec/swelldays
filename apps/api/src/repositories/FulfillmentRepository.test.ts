import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server/db', () => ({ prisma: { $transaction: vi.fn() } }));
vi.mock('server/repositories/LedgerRepository', () => ({ ledgerRepository: { recordSale: vi.fn() } }));
import { prisma } from 'server/db';
import { ledgerRepository } from './LedgerRepository';
import { SERIALIZATION_NAMESPACE } from 'server/lib/TransactionSerialization';
import { FulfillmentRepository, type FulfillmentPayload } from './FulfillmentRepository';

const repository = new FulfillmentRepository();
const payload: FulfillmentPayload = { orderId: 'order-1', paymentAttemptId: 'attempt-1', buyerId: 'buyer-1',
  externalOrderId: 'external-1', paidLines: [{ orderItemId: 'item-1', mediaItemId: 'media-1', sellerId: 'seller-1',
    buyerId: 'buyer-1', guestEmail: null, downloadToken: 'token', amountPaid: 1000, platformFee: 200,
    sellerEarnings: 800, currency: 'USD', deliverablePublicId: 'asset-1', deliverableType: 'PHOTO', previewUrl: 'preview' }] };

function makeTx() {
  return { $executeRaw: vi.fn(), order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueOrThrow: vi.fn().mockResolvedValue({ buyerId: 'buyer-1', guestEmail: null, totalAmount: 1000,
      items: [{ id: 'item-1', mediaItemId: 'media-1', sellerId: 'seller-1', unitAmountCents: 1000,
        currency: 'USD', platformFeeAmount: 200, sellerEarningsAmount: 800,
        deliverablePublicId: 'asset-1', deliverableType: 'PHOTO' }] }) },
    paymentAttempt: { findUnique: vi.fn().mockResolvedValue({ orderId: 'order-1', expectedAmountCents: 1000,
      expectedCurrency: 'USD' }) },
    purchase: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'purchase-1' }) },
    paidOrderLine: { create: vi.fn().mockResolvedValue({ id: 'paid-1' }) } };
}
function runWith(tx: ReturnType<typeof makeTx>) {
  vi.mocked(prisma.$transaction).mockImplementation((fn) => Reflect.apply(fn, undefined, [tx]));
}

beforeEach(() => vi.clearAllMocks());

describe('FulfillmentRepository', () => {
  it('creates an entitlement, durable paid line, and one source-linked sale', async () => {
    const tx = makeTx();
    runWith(tx);
    await expect(repository.commitFulfillment(payload)).resolves.toEqual({ applied: true,
      paidLineIds: ['paid-1'], hasExceptions: false });
    expect(tx.paidOrderLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      paymentAttemptId: 'attempt-1', purchaseId: 'purchase-1', deliveryStatus: 'DELIVERED' }) });
    expect(ledgerRepository.recordSale).toHaveBeenCalledWith(tx, { photographerId: 'seller-1', amount: 800,
      externalOrderId: 'external-1', paidOrderLineId: 'paid-1' });
  });

  it('records a duplicate entitlement as compensation-required without sale', async () => {
    const tx = makeTx(); tx.purchase.findFirst.mockResolvedValue({ id: 'existing' });
    runWith(tx);
    await expect(repository.commitFulfillment(payload)).resolves.toEqual({ applied: true,
      paidLineIds: ['paid-1'], hasExceptions: true });
    expect(tx.paidOrderLine.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      deliveryStatus: 'COMPENSATION_REQUIRED', exceptionReason: 'duplicate-entitlement' }) });
    expect(ledgerRepository.recordSale).not.toHaveBeenCalled();
  });

  it('stops after a lost order claim', async () => {
    const tx = makeTx(); tx.order.updateMany.mockResolvedValue({ count: 0 });
    runWith(tx);
    await expect(repository.commitFulfillment(payload)).resolves.toEqual({ applied: false });
    expect(tx.paymentAttempt.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an attempt belonging to another order before delivery writes', async () => {
    const tx = makeTx(); tx.paymentAttempt.findUnique.mockResolvedValue({ orderId: 'other-order', expectedAmountCents: 1000,
      expectedCurrency: 'USD' });
    runWith(tx);
    await expect(repository.commitFulfillment(payload)).rejects.toThrow('does not belong');
    expect(tx.purchase.create).not.toHaveBeenCalled();
    expect(tx.paidOrderLine.create).not.toHaveBeenCalled();
  });

  it('acquires the entitlement lock before claiming the order', async () => {
    const tx = makeTx();
    runWith(tx);

    await repository.commitFulfillment(payload);

    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.order.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('uses the buyer lock namespace for an authenticated order', async () => {
    const tx = makeTx();
    runWith(tx);

    await repository.commitFulfillment(payload);

    const [, ...values] = tx.$executeRaw.mock.calls[0]!;
    expect(values).toEqual([SERIALIZATION_NAMESPACE.buyer, 'buyer-1']);
  });

  it('uses the order lock namespace for a guest order', async () => {
    const tx = makeTx();
    tx.order.findUniqueOrThrow.mockResolvedValue({ ...await tx.order.findUniqueOrThrow(), buyerId: null,
      guestEmail: 'guest@example.com' });
    runWith(tx);

    await repository.commitFulfillment({
      ...payload,
      buyerId: null,
      paidLines: payload.paidLines.map((line) => ({
        ...line,
        buyerId: null,
        guestEmail: 'guest@example.com',
      })),
    });

    const [, ...values] = tx.$executeRaw.mock.calls[0]!;
    expect(values).toEqual([SERIALIZATION_NAMESPACE.order, 'order-1']);
  });

  it('records seller credits in stable seller order', async () => {
    const tx = makeTx();
    tx.order.findUniqueOrThrow.mockResolvedValue({ buyerId: 'buyer-1', guestEmail: null, totalAmount: 2000, items: [
      { id: 'item-z', mediaItemId: 'media-z', sellerId: 'zeta', unitAmountCents: 1000, currency: 'USD',
        platformFeeAmount: 200, sellerEarningsAmount: 800, deliverablePublicId: 'asset-1', deliverableType: 'PHOTO' },
      { id: 'item-a', mediaItemId: 'media-a', sellerId: 'alpha', unitAmountCents: 1000, currency: 'USD',
        platformFeeAmount: 200, sellerEarningsAmount: 800, deliverablePublicId: 'asset-1', deliverableType: 'PHOTO' },
    ] });
    tx.paymentAttempt.findUnique.mockResolvedValue({ orderId: 'order-1', expectedAmountCents: 2000,
      expectedCurrency: 'USD' });
    tx.purchase.create
      .mockResolvedValueOnce({ id: 'purchase-z' })
      .mockResolvedValueOnce({ id: 'purchase-a' });
    tx.paidOrderLine.create
      .mockResolvedValueOnce({ id: 'paid-a' })
      .mockResolvedValueOnce({ id: 'paid-z' });
    runWith(tx);

    await repository.commitFulfillment({
      ...payload,
      paidLines: [
        { ...payload.paidLines[0]!, orderItemId: 'item-z', mediaItemId: 'media-z', sellerId: 'zeta' },
        { ...payload.paidLines[0]!, orderItemId: 'item-a', mediaItemId: 'media-a', sellerId: 'alpha' },
      ],
    });

    expect(vi.mocked(ledgerRepository.recordSale).mock.calls.map((call) => call[1].photographerId))
      .toEqual(['alpha', 'zeta']);
  });

  it('rolls back before delivery when a candidate changes immutable economics', async () => {
    const tx = makeTx();
    runWith(tx);

    await expect(repository.commitFulfillment({ ...payload, paidLines: [
      { ...payload.paidLines[0]!, sellerEarnings: 799 },
    ] })).rejects.toThrow('immutable order economics');

    expect(tx.purchase.create).not.toHaveBeenCalled();
    expect(tx.paidOrderLine.create).not.toHaveBeenCalled();
    expect(ledgerRepository.recordSale).not.toHaveBeenCalled();
  });
});
