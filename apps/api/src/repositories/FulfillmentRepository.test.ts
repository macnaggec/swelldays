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
import { FulfillmentRepository } from './FulfillmentRepository';
import type { FulfillmentPayload } from './FulfillmentRepository';

const repo = new FulfillmentRepository();
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockRecordSale = ledgerRepository.recordSale as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const payload: FulfillmentPayload = {
  orderId: 'order-1',
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

describe('FulfillmentRepository.commitFulfillment', () => {
  it('completes the order, writes purchases, and records earnings when the guard passes', async () => {
    const tx = {
      order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      purchase: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.commitFulfillment(payload)).resolves.toEqual({ applied: true });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: payload.orderId, status: OrderStatus.PENDING },
      data: { status: OrderStatus.COMPLETED, externalOrderId: payload.externalOrderId },
    });
    expect(tx.purchase.createMany).toHaveBeenCalledWith({ data: payload.purchases });
    expect(mockRecordSale).toHaveBeenCalledTimes(1);
    expect(mockRecordSale).toHaveBeenCalledWith(tx, {
      photographerId: 'photographer-1',
      amount: 800,
      externalOrderId: payload.externalOrderId,
    });
  });

  it('skips purchase/ledger writes and resolves { applied: false } when the guard misses', async () => {
    const tx = {
      order: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      purchase: { createMany: vi.fn() },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.commitFulfillment(payload)).resolves.toEqual({ applied: false });

    expect(tx.purchase.createMany).not.toHaveBeenCalled();
    expect(mockRecordSale).not.toHaveBeenCalled();
  });
});
