import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  process.env.CRYPTOCLOUD_API_KEY = 'test-api-key';
  process.env.CRYPTOCLOUD_SHOP_ID = 'test-shop-id';
});

const mocks = vi.hoisted(() => ({
  getSummary: vi.fn(),
  requestPayout: vi.fn(),
}));

vi.mock('server/services/LedgerService', () => ({
  ledgerService: {
    getSummary: mocks.getSummary,
    requestPayout: mocks.requestPayout,
  },
}));

import { appRouter } from 'server/router';

describe('ledgerRouter.summary', () => {
  it('fetches the authenticated photographer ledger summary', async () => {
    const summary = {
      availableBalanceCents: 4500,
      pendingPayoutCents: 2200,
      payoutThresholdCents: 2000,
      recentTransactions: [],
      payoutRequests: [],
    };
    mocks.getSummary.mockResolvedValue(summary);

    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'photographer-1' } as never,
    });

    await expect(caller.ledger.summary()).resolves.toEqual(summary);
    expect(mocks.getSummary).toHaveBeenCalledWith('photographer-1');
  });

  it('requests payout for the authenticated photographer', async () => {
    const refreshedSummary = {
      availableBalanceCents: 0,
      pendingPayoutCents: 4500,
      payoutThresholdCents: 2000,
      recentTransactions: [],
      payoutRequests: [{
        id: 'payout-1',
        amount: 4500,
        status: 'PENDING',
        externalTransferId: null,
        note: null,
        requestedAt: new Date('2026-07-05T12:00:00.000Z'),
        processedAt: null,
      }],
    };
    mocks.requestPayout.mockResolvedValue(refreshedSummary);

    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'photographer-1' } as never,
    });

    await expect(caller.ledger.requestPayout()).resolves.toEqual(refreshedSummary);
    expect(mocks.requestPayout).toHaveBeenCalledWith('photographer-1');
  });
});
