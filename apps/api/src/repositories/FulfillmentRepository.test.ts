import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/db', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('server/repositories/LedgerRepository', () => ({
  ledgerRepository: {
    recordSale: vi.fn(),
  },
}));

import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { ledgerRepository } from 'server/repositories/LedgerRepository';
import { SERIALIZATION_NAMESPACE } from 'server/lib/TransactionSerialization';
import { FulfillmentRepository } from './FulfillmentRepository';
import type { FulfillmentPayload } from './FulfillmentRepository';

const repo = new FulfillmentRepository();
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockRecordSale = ledgerRepository.recordSale as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const payload: FulfillmentPayload = {
  orderId: 'order-1',
  buyerId: 'buyer-1',
  externalOrderId: 'CC-ILRAJE1Q',
  purchases: [{
    orderId: 'order-1',
    mediaItemId: 'media-1',
    buyerId: 'buyer-1',
    guestEmail: null,
    downloadToken: 'a'.repeat(64),
    amountPaid: 1000,
    platformFee: 200,
    photographerEarned: 800,
    previewUrl: 'https://res.cloudinary.com/preview',
  }],
  earnings: [{ photographerId: 'photographer-1', amount: 800 }],
};

function makeTx() {
  return {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    purchase: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

describe('FulfillmentRepository.commitFulfillment', () => {
  it('completes the order, writes purchases, and records earnings when the guard passes', async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.commitFulfillment(payload)).resolves.toEqual({ applied: true, skippedMediaItemIds: [] });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: payload.orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.COMPLETED, externalOrderId: payload.externalOrderId },
    });
    expect(tx.purchase.createMany).toHaveBeenCalledWith({ data: payload.purchases, skipDuplicates: true });
    expect(mockRecordSale).toHaveBeenCalledTimes(1);
    expect(mockRecordSale).toHaveBeenCalledWith(tx, {
      photographerId: 'photographer-1',
      amount: 800,
      externalOrderId: payload.externalOrderId,
    });
  });

  it('reports skipped media item ids when a Purchase insert collides on (buyerId, mediaItemId)', async () => {
    const twoItemPayload: FulfillmentPayload = {
      ...payload,
      purchases: [
        payload.purchases[0]!,
        { ...payload.purchases[0]!, mediaItemId: 'media-2', downloadToken: 'b'.repeat(64) },
      ],
    };
    const tx = {
      ...makeTx(),
      purchase: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([{ mediaItemId: 'media-2' }]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.commitFulfillment(twoItemPayload)).resolves.toEqual({
      applied: true,
      skippedMediaItemIds: ['media-1'],
    });

    expect(tx.purchase.findMany).toHaveBeenCalledWith({
      where: { orderId: twoItemPayload.orderId },
      select: { mediaItemId: true },
    });
  });

  it('skips purchase/ledger writes and resolves { applied: false } when the guard misses', async () => {
    const tx = { ...makeTx(), order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.commitFulfillment(payload)).resolves.toEqual({ applied: false });

    expect(tx.purchase.createMany).not.toHaveBeenCalled();
    expect(mockRecordSale).not.toHaveBeenCalled();
  });

  it('acquires the advisory lock before the order claim', async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await repo.commitFulfillment(payload);

    const lockCallOrder = tx.$executeRaw.mock.invocationCallOrder[0]!;
    const claimCallOrder = tx.order.updateMany.mock.invocationCallOrder[0]!;
    expect(lockCallOrder).toBeLessThan(claimCallOrder);
  });

  it('locks on the buyer namespace with the buyerId as key for a buyer-owned order', async () => {
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await repo.commitFulfillment(payload);

    const [, ...values] = tx.$executeRaw.mock.calls[0]!;
    expect(values).toEqual([SERIALIZATION_NAMESPACE.buyer, 'buyer-1']);
  });

  it('locks on the order namespace for a guest payload (buyerId: null)', async () => {
    const guestPayload: FulfillmentPayload = { ...payload, buyerId: null };
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await repo.commitFulfillment(guestPayload);

    const [, ...values] = tx.$executeRaw.mock.calls[0]!;
    expect(values).toEqual([SERIALIZATION_NAMESPACE.order, guestPayload.orderId]);
  });

  it('records earnings for sellers supplied in reverse alphabetical order sequentially, ascending by photographerId', async () => {
    const reversedPayload: FulfillmentPayload = {
      ...payload,
      earnings: [
        { photographerId: 'zeta', amount: 100 },
        { photographerId: 'alpha', amount: 200 },
      ],
    };
    const tx = makeTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await repo.commitFulfillment(reversedPayload);

    expect(mockRecordSale).toHaveBeenCalledTimes(2);
    const recordedOrder = mockRecordSale.mock.calls.map((call) => call[1].photographerId);
    expect(recordedOrder).toEqual(['alpha', 'zeta']);
  });
});
