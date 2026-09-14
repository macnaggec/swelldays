import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { PaymentNotificationRepository } from './PaymentNotificationRepository';

beforeEach(() => vi.clearAllMocks());

describe('PaymentNotificationRepository listing', () => {
  it('bounds the operator page size and orders newest first', async () => {
    vi.mocked(prisma.paymentNotification.findMany).mockResolvedValue([]);
    await new PaymentNotificationRepository().list({ limit: 500 });
    expect(prisma.paymentNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: 101,
    }));
  });
});
