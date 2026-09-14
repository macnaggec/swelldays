import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOperatorStatus: vi.fn(), replayNotification: vi.fn(), reconcilePayments: vi.fn(),
}));

vi.mock('server/services/PaymentService', () => ({ paymentService: {
  getOperatorStatus: mocks.getOperatorStatus,
  replayNotification: mocks.replayNotification,
} }));
vi.mock('server/jobs/reconcilePayments', () => ({ reconcilePayments: mocks.reconcilePayments }));

import { adminPaymentsRouter } from './adminPayments';
import type { TRPCContext } from 'server/trpc';

const notificationId = '11111111-1111-4111-8111-111111111111';
const anonymous = adminPaymentsRouter.createCaller({ session: null, user: null });

function caller(role: 'USER' | 'ADMIN') {
  const now = new Date('2026-09-14T18:30:00Z');
  const id = `${role}-1`;
  const context: TRPCContext = {
    session: { id: 'session-1', token: 'token-1', userId: id, expiresAt: now,
      createdAt: now, updatedAt: now, ipAddress: null, userAgent: null },
    user: { id, role, name: role, email: `${id}@example.com`, emailVerified: true,
      image: null, createdAt: now, updatedAt: now },
  };
  return adminPaymentsRouter.createCaller(context);
}

describe('admin payments router', () => {
  it('rejects unauthenticated and non-admin callers', async () => {
    await expect(anonymous.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller('USER').list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets admins list, replay, and run reconciliation', async () => {
    const status = { notifications: { items: [], nextCursor: null }, unresolvedAttempts: [] };
    mocks.getOperatorStatus.mockResolvedValue(status);
    mocks.replayNotification.mockResolvedValue({ id: notificationId });
    mocks.reconcilePayments.mockResolvedValue({ reconciliation: {}, notifications: {} });
    const admin = caller('ADMIN');
    await expect(admin.list({ status: 'retry-wait' })).resolves.toEqual(status);
    expect(mocks.getOperatorStatus).toHaveBeenCalledWith({ status: 'retry-wait', limit: 50 });
    await admin.replay({ notificationId });
    await admin.runReconciliation();
  });

  it('uses one generic not-found result for missing and ineligible replay', async () => {
    mocks.replayNotification.mockResolvedValue(null);
    await expect(caller('ADMIN').replay({ notificationId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
