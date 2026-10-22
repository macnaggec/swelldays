import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  order: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  paymentAttempt: { updateMany: vi.fn() },
}));

vi.mock('server/db', () => ({
  prisma: { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) },
}));

import { finalizeCheckoutRevision, resolveCheckoutRevisionForReceipt } from './CheckoutRevision';

const revision = {
  clientRequestId: 'expanded-request',
  items: [
    {
      mediaItemId: 'media-1', unitAmountCents: 1000, currency: 'USD', sellerId: 'seller-1',
      feePolicyVersion: 'paddle-50c-30-v1', platformFeeAmount: 350,
      sellerEarningsAmount: 650, deliverablePublicId: 'media/1', deliverableType: 'PHOTO',
    },
    {
      mediaItemId: 'media-2', unitAmountCents: 1300, currency: 'USD', sellerId: 'seller-1',
      feePolicyVersion: 'paddle-50c-30-v1', platformFeeAmount: 440,
      sellerEarningsAmount: 860, deliverablePublicId: 'media/2', deliverableType: 'PHOTO',
    },
  ],
};

const receipt = {
  identity: { provider: 'paddle' as const, environment: 'sandbox' as const, providerTransactionId: 'txn-1' },
  status: 'paid' as const,
  paidTotalCents: 2300,
  paidCurrency: 'USD',
  subtotalCents: 2300,
  taxCents: 0,
  discountCents: 0,
  settlementNetCents: 2100,
  providerAccountId: null,
  providerTestMode: true,
};

describe('resolveCheckoutRevisionForReceipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.order.findUnique.mockResolvedValue({ buyerId: 'buyer-1' });
    tx.order.findUniqueOrThrow.mockResolvedValue({ status: 'PENDING', pendingRevision: revision });
  });

  it('commits expanded snapshots before fulfillment when the expanded total was paid', async () => {
    await resolveCheckoutRevisionForReceipt('order-1', receipt);

    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1' },
      data: expect.objectContaining({
        clientRequestId: 'expanded-request',
        totalAmount: 2300,
        items: { deleteMany: {}, createMany: { data: revision.items } },
      }),
    }));
    expect(tx.paymentAttempt.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      data: { expectedAmountCents: 2300 },
    });
  });

  it('keeps the original snapshots when Paddle charged only the original total', async () => {
    await resolveCheckoutRevisionForReceipt('order-1', {
      ...receipt,
      paidTotalCents: 1000,
      subtotalCents: 1000,
    });

    expect(tx.paymentAttempt.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { pendingRevision: expect.anything() },
    });
  });
});

describe('finalizeCheckoutRevision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.order.findUnique.mockResolvedValue({ buyerId: 'buyer-1' });
  });

  it('accepts an exact revision already committed by a racing webhook', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      status: 'COMPLETED',
      clientRequestId: revision.clientRequestId,
      pendingRevision: null,
    });

    await expect(finalizeCheckoutRevision('order-1', revision.clientRequestId)).resolves.toBe(true);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('does not accept a cleared revision belonging to another request', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      status: 'PENDING',
      clientRequestId: 'original-request',
      pendingRevision: null,
    });

    await expect(finalizeCheckoutRevision('order-1', revision.clientRequestId)).resolves.toBe(false);
  });
});
