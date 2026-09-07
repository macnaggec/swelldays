import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/db', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
    },
  },
}));

import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { OrderRepository } from './OrderRepository';

const repo = new OrderRepository();
const mockOrderCreate = prisma.order.create as ReturnType<typeof vi.fn>;
const mockOrderUpdateMany = prisma.order.updateMany as ReturnType<typeof vi.fn>;
const mockOrderItemFindMany = prisma.orderItem.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('OrderRepository.createOrder', () => {
  it('derives the order total from lines and persists every snapshot field through the supplied client', async () => {
    const txOrderCreate = vi.fn().mockResolvedValue({ id: 'order-1' });
    const lines = [
      {
        mediaItemId: 'media-1',
        unitAmountCents: 333,
        currency: 'USD' as const,
        sellerId: 'seller-1',
        feePolicyVersion: 'standard-20-v1' as const,
        platformFeeAmount: 67,
        sellerEarningsAmount: 266,
        deliverablePublicId: 'waves/photo-1',
        deliverableType: 'PHOTO' as const,
      },
      {
        mediaItemId: 'media-2',
        unitAmountCents: 1000,
        currency: 'USD' as const,
        sellerId: 'seller-2',
        feePolicyVersion: 'paddle-50c-30-v1' as const,
        platformFeeAmount: 350,
        sellerEarningsAmount: 650,
        deliverablePublicId: 'waves/video-2',
        deliverableType: 'VIDEO' as const,
      },
    ];

    await repo.createOrder({ buyerId: 'buyer-1', clientRequestId: 'request-1', items: lines }, { order: { create: txOrderCreate } });

    expect(txOrderCreate).toHaveBeenCalledWith({
      data: {
        buyerId: 'buyer-1',
        guestEmail: undefined,
        totalAmount: 1333,
        clientRequestId: 'request-1',
        items: { createMany: { data: lines } },
      },
      include: {
        items: {
          select: {
            id: true,
            mediaItemId: true,
            unitAmountCents: true,
            currency: true,
            sellerId: true,
            feePolicyVersion: true,
            platformFeeAmount: true,
            sellerEarningsAmount: true,
            deliverablePublicId: true,
            deliverableType: true,
          },
        },
      },
    });
    expect(mockOrderCreate).not.toHaveBeenCalled();
  });
});

describe('OrderRepository.markOrderFailed', () => {
  it('guards the write with a status: PENDING where clause', async () => {
    mockOrderUpdateMany.mockResolvedValue({ count: 1 });

    await repo.markOrderFailed('order-1');

    expect(mockOrderUpdateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: OrderStatus.PENDING },
      data: { status: OrderStatus.FAILED },
    });
  });

  it('resolves without throwing when the order is already terminal (count: 0)', async () => {
    mockOrderUpdateMany.mockResolvedValue({ count: 0 });

    await expect(repo.markOrderFailed('order-1')).resolves.toBeUndefined();
  });
});

describe('OrderRepository.findPendingMediaItemIds', () => {
  it('queries OrderItem filtered by mediaItemId, buyer, PENDING status, and the window cutoff', async () => {
    mockOrderItemFindMany.mockResolvedValue([{ mediaItemId: 'media-1' }, { mediaItemId: 'media-2' }]);
    const sinceCreatedAt = new Date('2026-01-01T00:00:00Z');

    const result = await repo.findPendingMediaItemIds('buyer-1', ['media-1', 'media-2'], sinceCreatedAt);

    expect(mockOrderItemFindMany).toHaveBeenCalledWith({
      where: {
        mediaItemId: { in: ['media-1', 'media-2'] },
        order: {
          buyerId: 'buyer-1',
          status: OrderStatus.PENDING,
          createdAt: { gte: sinceCreatedAt },
        },
      },
      select: { mediaItemId: true },
    });
    expect(result).toEqual(['media-1', 'media-2']);
  });
});
