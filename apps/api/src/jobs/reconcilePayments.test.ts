import { describe, expect, it, vi } from 'vitest';
import { reconcilePayments } from './reconcilePayments';

describe('reconcilePayments', () => {
  it('reconciles attempts before draining the durable inbox', async () => {
    const order: string[] = [];
    const reconciliation = { inspected: 1, enqueuedPaid: 1, markedUnknown: 0, markedFailed: 0, providerErrors: 0 };
    const notifications = { claimed: 1, completed: 1, rejected: 0, retried: 0, exhausted: 0 };
    const payments = {
      reconcilePaymentAttempts: vi.fn(async () => { order.push('reconcile'); return reconciliation; }),
      processPendingNotifications: vi.fn(async () => { order.push('process'); return notifications; }),
    };
    await expect(reconcilePayments(payments)).resolves.toEqual({ reconciliation, notifications });
    expect(order).toEqual(['reconcile', 'process']);
  });

  it('lets unexpected errors reject to the scheduler', async () => {
    const payments = {
      reconcilePaymentAttempts: vi.fn().mockRejectedValue(new Error('database unavailable')),
      processPendingNotifications: vi.fn(),
    };
    await expect(reconcilePayments(payments)).rejects.toThrow('database unavailable');
    expect(payments.processPendingNotifications).not.toHaveBeenCalled();
  });
});
