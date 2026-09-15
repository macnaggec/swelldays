import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { PurchaseRepository } from './PurchaseRepository';

const repository = new PurchaseRepository();

beforeEach(() => vi.clearAllMocks());

describe('PurchaseRepository active entitlement projection', () => {
  it('excludes revoked purchases from buyer lists and entitlement checks', async () => {
    vi.mocked(prisma.purchase.findMany).mockResolvedValue([]);

    await repository.findByBuyer('buyer-1');
    expect(prisma.purchase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { buyerId: 'buyer-1', revokedAt: null },
    }));

    await repository.findPurchasedItemIds('buyer-1', ['media-1']);
    expect(prisma.purchase.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { buyerId: 'buyer-1', mediaItemId: { in: ['media-1'] }, revokedAt: null },
    }));
  });

  it('does not authorize a revoked download token or order purchase', async () => {
    vi.mocked(prisma.purchase.findFirst).mockResolvedValue(null);

    await repository.findByDownloadToken('token-1');
    expect(prisma.purchase.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { downloadToken: 'token-1', revokedAt: null },
    }));

    await repository.findByIdAndOrder('purchase-1', 'order-1');
    expect(prisma.purchase.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'purchase-1', orderId: 'order-1', revokedAt: null },
    }));
  });
});
