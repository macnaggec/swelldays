import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/db', () => ({
  prisma: {
    order: {
      updateMany: vi.fn(),
    },
  },
}));

import { OrderStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { OrderRepository } from './OrderRepository';

const repo = new OrderRepository();
const mockOrderUpdateMany = prisma.order.updateMany as ReturnType<typeof vi.fn>;

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
