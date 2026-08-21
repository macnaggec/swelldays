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
  checkInvariant: vi.fn(),
  completePayout: vi.fn(),
  listOperatorPayouts: vi.fn(),
  markPayoutProcessing: vi.fn(),
  rejectPayout: vi.fn(),
}));

vi.mock('server/services/LedgerService', () => ({
  ledgerService: {
    checkInvariant: mocks.checkInvariant,
    completePayout: mocks.completePayout,
    listOperatorPayouts: mocks.listOperatorPayouts,
    markPayoutProcessing: mocks.markPayoutProcessing,
    rejectPayout: mocks.rejectPayout,
  },
}));

import { appRouter } from 'server/router';

const payoutRequestId = '11111111-1111-4111-8111-111111111111';

describe('admin ledger router', () => {
  it('rejects signed-in non-admin payout operators', async () => {
    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'user-1', role: 'USER' } as never,
    });

    await expect(caller.admin.ledger.listPayouts()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.listOperatorPayouts).not.toHaveBeenCalled();
  });

  it('rejects non-admins from the invariant check', async () => {
    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'user-1', role: 'USER' } as never,
    });

    await expect(caller.admin.ledger.checkInvariant()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(mocks.checkInvariant).not.toHaveBeenCalled();
  });

  it('allows admins to run the invariant check', async () => {
    mocks.checkInvariant.mockResolvedValue([]);

    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'admin-1', role: 'ADMIN' } as never,
    });

    await expect(caller.admin.ledger.checkInvariant()).resolves.toEqual([]);
    expect(mocks.checkInvariant).toHaveBeenCalledWith();
  });

  it('allows admins to list and transition payout requests', async () => {
    const payouts = [{
      id: payoutRequestId,
      amount: 4500,
      status: 'PENDING',
      externalTransferId: null,
      note: null,
      requestedAt: new Date('2026-07-05T12:00:00.000Z'),
      processedAt: null,
      photographer: {
        id: 'photographer-1',
        email: 'photographer@example.com',
        name: 'Pipeline Shooter',
      },
    }];
    mocks.listOperatorPayouts.mockResolvedValue(payouts);
    mocks.markPayoutProcessing.mockResolvedValue(undefined);
    mocks.completePayout.mockResolvedValue(undefined);
    mocks.rejectPayout.mockResolvedValue(undefined);

    const caller = appRouter.createCaller({
      session: {} as never,
      user: { id: 'admin-1', role: 'ADMIN' } as never,
    });

    await expect(caller.admin.ledger.listPayouts()).resolves.toEqual(payouts);
    await caller.admin.ledger.markProcessing({ payoutRequestId });
    await caller.admin.ledger.complete({ payoutRequestId, externalTransferId: 'manual-1' });
    await caller.admin.ledger.reject({ payoutRequestId, note: 'Bank details invalid' });

    expect(mocks.listOperatorPayouts).toHaveBeenCalledWith();
    expect(mocks.markPayoutProcessing).toHaveBeenCalledWith(payoutRequestId);
    expect(mocks.completePayout).toHaveBeenCalledWith(payoutRequestId, 'manual-1');
    expect(mocks.rejectPayout).toHaveBeenCalledWith(payoutRequestId, 'Bank details invalid');
  });
});
