import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOperatorStatus: vi.fn(), replayNotification: vi.fn(), reconcilePayments: vi.fn(),
  listPending: vi.fn(), recordManual: vi.fn(), apply: vi.fn(), dismiss: vi.fn(), resolveCompensation: vi.fn(),
}));

vi.mock('server/services/PaymentService', () => ({ paymentService: {
  getOperatorStatus: mocks.getOperatorStatus,
  replayNotification: mocks.replayNotification,
} }));
vi.mock('server/jobs/reconcilePayments', () => ({ reconcilePayments: mocks.reconcilePayments }));
vi.mock('server/services/PaymentAdjustmentService', () => ({ paymentAdjustmentService: {
  listPending: mocks.listPending, recordManual: mocks.recordManual, apply: mocks.apply,
  dismiss: mocks.dismiss, resolveCompensation: mocks.resolveCompensation,
} }));

import { adminPaymentsRouter } from './adminPayments';
import type { TRPCContext } from 'server/trpc';

const notificationId = '11111111-1111-4111-8111-111111111111';
const adjustmentId = '22222222-2222-4222-8222-222222222222';
const paidOrderLineId = '33333333-3333-4333-8333-333333333333';
const paymentAttemptId = '44444444-4444-4444-8444-444444444444';
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

  it('protects every exception mutation with the admin boundary', async () => {
    await expect(anonymous.listExceptions({ limit: 10 })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(caller('USER').applyAdjustment({ adjustmentId, allocations: [{ paidOrderLineId, amountCents: 1 }],
      revokeEntitlements: false, note: 'reviewed' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates and delegates list, manual record, apply, dismiss, and compensation resolution', async () => {
    mocks.listPending.mockResolvedValue({ adjustments: [], compensationLines: [], nextCursor: null });
    const admin = caller('ADMIN');
    await admin.listExceptions({ limit: 10 });
    expect(mocks.listPending).toHaveBeenCalledWith(10, undefined);
    const manual = { paymentAttemptId, providerAdjustmentId: 'support-ticket-19', action: 'refund' as const,
      status: 'approved' as const, amountCents: 500, currency: 'usd', occurredAt: new Date('2026-09-15T00:00:00Z'),
      updatedAt: new Date('2026-09-15T01:00:00Z'), note: 'CryptoCloud support confirmed refund' };
    await admin.recordManualAdjustment(manual);
    expect(mocks.recordManual).toHaveBeenCalledWith({ ...manual, currency: 'USD' }, 'ADMIN-1');
    const apply = { adjustmentId, allocations: [{ paidOrderLineId, amountCents: 500 }],
      revokeEntitlements: false, note: 'apply approved refund' };
    await admin.applyAdjustment(apply); expect(mocks.apply).toHaveBeenCalledWith(apply, 'ADMIN-1');
    await admin.dismissAdjustment({ adjustmentId, note: 'provider rejected it' });
    expect(mocks.dismiss).toHaveBeenCalledWith(adjustmentId, 'provider rejected it', 'ADMIN-1');
    await admin.resolveCompensation({ adjustmentId, paidOrderLineId, note: 'buyer refunded' });
    expect(mocks.resolveCompensation).toHaveBeenCalledWith(paidOrderLineId, adjustmentId, 'buyer refunded', 'ADMIN-1');
    await expect(admin.applyAdjustment({ ...apply, allocations: [] })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
