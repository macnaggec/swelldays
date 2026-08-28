import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/db', () => ({
  prisma: {
    order: {
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
const mockOrderUpdateMany = prisma.order.updateMany as ReturnType<typeof vi.fn>;
const mockOrderItemFindMany = prisma.orderItem.findMany as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

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
