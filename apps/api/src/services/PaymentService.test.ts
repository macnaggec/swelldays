import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { PaymentCreationError } from 'server/providers/payment/PaymentAdapter';
import type { IPaymentAttemptRepository, PaymentAttemptRecord } from 'server/repositories/PaymentAttemptRepository';
import type {
  IPaymentNotificationRepository,
  PaymentNotificationClaim,
  PaymentNotificationRecord,
} from 'server/repositories/PaymentNotificationRepository';
import { PAYMENT_CREATION_LEASE_MS, PaymentService } from 'server/services/PaymentService';

const NOW = new Date('2026-09-14T16:00:00Z');
const attempt: PaymentAttemptRecord = {
  id: 'attempt-1', orderId: 'order-1', provider: 'cryptocloud',
  creationState: 'creating', creationFailureCode: null,
  environment: null, providerTransactionId: null, checkoutUrl: null, expiresAt: null,
  expectedAmountCents: 1500, expectedCurrency: 'USD', providerTestMode: null,
  createdAt: new Date(NOW.getTime() - 1_000), updatedAt: new Date(NOW.getTime() - 1_000),
};

const attempts: IPaymentAttemptRepository = {
  prepareAttempt: vi.fn(), bindProviderSession: vi.fn(),
  markCreationUnknown: vi.fn(), markCreationFailed: vi.fn(),
  findById: vi.fn(), findByOrderId: vi.fn(), findByIdentity: vi.fn(),
  findForReconciliation: vi.fn(),
  listUnresolved: vi.fn(),
};
const notifications: IPaymentNotificationRepository = {
  store: vi.fn(), claimNext: vi.fn(), bind: vi.fn(), complete: vi.fn(), reject: vi.fn(), retry: vi.fn(),
  list: vi.fn(), replay: vi.fn(),
};
const adapter: PaymentAdapter = {
  provider: 'cryptocloud', createCheckoutSession: vi.fn(),
  updateCheckoutSession: vi.fn(),
  verifyWebhook: vi.fn(), parseWebhookEvent: vi.fn(),
  retrieveReceipt: vi.fn(), expectedAccountId: vi.fn(),
};
const fulfillment = { fulfillOrder: vi.fn() };
const adjustments = { record: vi.fn() };
const session = {
  providerTransactionId: 'INV-1', environment: 'production' as const,
  checkoutUrl: 'https://pay.example/INV-1', expiresAt: new Date('2026-09-14T17:00:00Z'),
  settlement: 'pending' as const, providerTestMode: false,
};
const readyAttempt: PaymentAttemptRecord = {
  ...attempt, creationState: 'ready', environment: 'production',
  providerTransactionId: 'INV-1', checkoutUrl: session.checkoutUrl,
  expiresAt: session.expiresAt, providerTestMode: false,
};
const identity = {
  provider: 'cryptocloud' as const, environment: 'production' as const,
  providerTransactionId: 'INV-1',
};
const receipt = {
  identity, status: 'unpaid' as const, paidTotalCents: 1500, paidCurrency: 'USD',
  subtotalCents: null, taxCents: null, discountCents: null, settlementNetCents: null,
  providerAccountId: null, providerTestMode: false,
};
const notification: PaymentNotificationRecord = {
  id: 'notification-1', eventKey: 'event:cryptocloud:evt-1', eventType: 'order.completed',
  provider: 'cryptocloud', sourceEventId: 'evt-1', occurredAt: NOW, environment: 'production',
  providerTransactionId: 'INV-1', correlationAttemptId: 'attempt-1', providerTestMode: false,
  adjustmentProviderId: null, adjustmentAction: null, adjustmentStatus: null,
  adjustmentAmountCents: null, adjustmentCurrency: null, adjustmentUpdatedAt: null,
  paymentAttemptId: null, orderId: null, status: 'received', resolution: null, processingAttempts: 0,
  availableAt: NOW, claimToken: null, claimExpiresAt: null, lastErrorCode: null,
  receivedAt: NOW, updatedAt: NOW, completedAt: null,
};
const claim: PaymentNotificationClaim = {
  ...notification, status: 'processing', processingAttempts: 1, claimToken: 'claim-1',
  claimExpiresAt: new Date(NOW.getTime() + 30_000),
};

function service(checkout = adapter, known: readonly PaymentAdapter[] = [adapter]): PaymentService {
  return new PaymentService(attempts, notifications, checkout, known, fulfillment, () => NOW, adjustments);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attempts.prepareAttempt).mockResolvedValue(attempt);
  vi.mocked(attempts.findById).mockResolvedValue(attempt);
  vi.mocked(attempts.findByOrderId).mockResolvedValue(readyAttempt);
  vi.mocked(attempts.bindProviderSession).mockResolvedValue(readyAttempt);
  vi.mocked(attempts.markCreationUnknown).mockImplementation(async (_id, code) => ({
    ...attempt, creationState: 'unknown', creationFailureCode: code,
  }));
  vi.mocked(attempts.markCreationFailed).mockImplementation(async (_id, code) => ({
    ...readyAttempt, creationState: 'definitively-failed', creationFailureCode: code,
  }));
  vi.mocked(adapter.createCheckoutSession).mockResolvedValue(session);
  vi.mocked(adapter.updateCheckoutSession!).mockResolvedValue(undefined);
  vi.mocked(adapter.retrieveReceipt).mockResolvedValue(receipt);
  vi.mocked(adapter.expectedAccountId).mockReturnValue(null);
  vi.mocked(fulfillment.fulfillOrder).mockResolvedValue({ type: 'fulfilled' });
  vi.mocked(notifications.store).mockResolvedValue({
    inserted: true,
    record: notification,
  });
  vi.mocked(notifications.claimNext).mockResolvedValue(null);
  vi.mocked(notifications.bind).mockResolvedValue(true);
  vi.mocked(notifications.complete).mockResolvedValue(true);
  vi.mocked(notifications.reject).mockResolvedValue(true);
  vi.mocked(notifications.retry).mockResolvedValue('retry-wait');
  vi.mocked(notifications.list).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(attempts.findForReconciliation).mockResolvedValue([]);
  vi.mocked(attempts.listUnresolved).mockResolvedValue([]);
});

describe('PaymentService preparation and creation', () => {
  it('prepares a creating attempt through the supplied transaction client without provider I/O', async () => {
    const db = { paymentAttempt: { create: vi.fn() } };
    await service().prepareAttempt({ orderId: 'order-1', totalCents: 1500 }, db);
    expect(attempts.prepareAttempt).toHaveBeenCalledWith({
      orderId: 'order-1', provider: 'cryptocloud', expectedAmountCents: 1500, expectedCurrency: 'USD',
    }, db);
    expect(adapter.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('calls creation exactly once for a young prepared attempt and binds before returning ready', async () => {
    await expect(service().openPreparedAttempt({
      attemptId: 'attempt-1', successUrl: 'https://example/success', failUrl: 'https://example/fail',
    })).resolves.toEqual({ type: 'ready', checkoutUrl: session.checkoutUrl, expiresAt: session.expiresAt });
    expect(adapter.createCheckoutSession).toHaveBeenCalledOnce();
    expect(adapter.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ paymentAttemptId: 'attempt-1' }));
    expect(attempts.bindProviderSession).toHaveBeenCalledWith(expect.objectContaining({ providerTransactionId: 'INV-1' }));
  });

  it('marks stale creating unknown and never calls creation', async () => {
    vi.mocked(attempts.findById).mockResolvedValue({
      ...attempt, createdAt: new Date(NOW.getTime() - PAYMENT_CREATION_LEASE_MS),
    });
    await expect(service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' }))
      .resolves.toEqual({ type: 'unknown', reason: 'stale-creating' });
    expect(adapter.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('treats a partially bound creating attempt as inconsistent without provider I/O', async () => {
    vi.mocked(attempts.findById).mockResolvedValue({ ...attempt, environment: 'production' });
    await expect(service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' }))
      .resolves.toEqual({ type: 'unknown', reason: 'inconsistent-attempt' });
    expect(adapter.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('persists timeout ambiguity and never retries an unknown attempt', async () => {
    vi.mocked(adapter.createCheckoutSession).mockRejectedValue(
      new PaymentCreationError('unknown', 'provider-timeout', 'timeout'),
    );
    await expect(service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' }))
      .resolves.toEqual({ type: 'unknown', reason: 'provider-timeout' });
    vi.mocked(attempts.findById).mockResolvedValue({
      ...attempt, creationState: 'unknown', creationFailureCode: 'provider-timeout',
    });
    await service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' });
    expect(adapter.createCheckoutSession).toHaveBeenCalledOnce();
  });

  it('persists a definite provider rejection', async () => {
    vi.mocked(adapter.createCheckoutSession).mockRejectedValue(
      new PaymentCreationError('definitively-failed', 'provider-rejected', 'rejected'),
    );
    await expect(service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' }))
      .resolves.toEqual({ type: 'definitively-failed', reason: 'provider-rejected' });
    expect(attempts.markCreationFailed).toHaveBeenCalledWith('attempt-1', 'provider-rejected');
  });

  it('records a successful-response binding failure as unknown', async () => {
    vi.mocked(attempts.bindProviderSession).mockRejectedValue(new Error('db response lost'));
    await expect(service().openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' }))
      .resolves.toEqual({ type: 'unknown', reason: 'local-persistence-failed' });
  });

  it('fulfills immediate mock settlement only after the binding is durable', async () => {
    const mock: PaymentAdapter = {
      ...adapter, provider: 'mock',
      createCheckoutSession: vi.fn().mockResolvedValue({
        ...session, providerTransactionId: 'mock-1', environment: 'test',
        checkoutUrl: 'https://example/success', expiresAt: null,
        settlement: 'completed', providerTestMode: null,
      }),
    };
    vi.mocked(attempts.findById).mockResolvedValue({ ...attempt, provider: 'mock' });
    vi.mocked(attempts.bindProviderSession).mockResolvedValue({
      ...readyAttempt, provider: 'mock', environment: 'test', providerTransactionId: 'mock-1',
      checkoutUrl: 'https://example/success', expiresAt: null, providerTestMode: null,
    });
    await service(mock, [mock]).openPreparedAttempt({ attemptId: 'attempt-1', successUrl: '', failUrl: '' });
    expect(vi.mocked(attempts.bindProviderSession).mock.invocationCallOrder[0])
      .toBeLessThan(fulfillment.fulfillOrder.mock.invocationCallOrder[0]!);
  });
});

describe('PaymentService resume policy', () => {
  it('updates a bound checkout through the owning provider adapter', async () => {
    await expect(service().reconfigureAttempt({ orderId: 'order-1', totalCents: 2300 }))
      .resolves.toEqual({
        type: 'ready', checkoutUrl: session.checkoutUrl, expiresAt: session.expiresAt,
      });
    expect(adapter.updateCheckoutSession).toHaveBeenCalledWith({
      identity,
      paymentAttemptId: 'attempt-1',
      totalCents: 2300,
    });
  });

  it('returns an unexpired authoritative URL without provider lookup', async () => {
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({
      type: 'ready', checkoutUrl: session.checkoutUrl, expiresAt: session.expiresAt,
    });
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('marks an expired unpaid attempt definitively failed', async () => {
    vi.mocked(attempts.findByOrderId).mockResolvedValue({
      ...readyAttempt, expiresAt: new Date(NOW.getTime() - 1),
    });
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({
      type: 'definitively-failed', reason: 'authoritative-expiry',
    });
  });

  it('keeps a null-expiry unpaid Paddle attempt ready after authenticated inspection', async () => {
    const paddle: PaymentAdapter = { ...adapter, provider: 'paddle' };
    vi.mocked(attempts.findByOrderId).mockResolvedValue({
      ...readyAttempt, provider: 'paddle', environment: 'sandbox', expiresAt: null,
    });
    vi.mocked(paddle.retrieveReceipt).mockResolvedValue({
      ...receipt,
      identity: { provider: 'paddle', environment: 'sandbox', providerTransactionId: 'INV-1' },
    });
    await expect(service(adapter, [paddle]).resumeAttempt('order-1')).resolves.toEqual({
      type: 'ready', checkoutUrl: session.checkoutUrl, expiresAt: null,
    });
    expect(paddle.retrieveReceipt).toHaveBeenCalledOnce();
  });

  it('reports paid, persists cancelled, and keeps lookup failure transient', async () => {
    vi.mocked(attempts.findByOrderId).mockResolvedValue({ ...readyAttempt, expiresAt: null });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'paid' });
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({ type: 'payment-received' });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'cancelled' });
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({
      type: 'definitively-failed', reason: 'provider-cancelled',
    });
    vi.mocked(adapter.retrieveReceipt).mockRejectedValue(new Error('offline'));
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({
      type: 'unknown', reason: 'provider-unreachable',
    });
    expect(attempts.markCreationUnknown).not.toHaveBeenCalled();
  });

  it('uses the stored provider after checkout configuration changes', async () => {
    const current: PaymentAdapter = {
      ...adapter, provider: 'mock', retrieveReceipt: vi.fn(), expectedAccountId: vi.fn(),
    };
    vi.mocked(attempts.findByOrderId).mockResolvedValue({ ...readyAttempt, expiresAt: null });
    await service(current, [adapter]).resumeAttempt('order-1');
    expect(adapter.retrieveReceipt).toHaveBeenCalledOnce();
    expect(current.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('returns conservative unknowns for missing and inconsistent attempts', async () => {
    vi.mocked(attempts.findByOrderId).mockResolvedValue(null);
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({ type: 'unknown', reason: 'missing-attempt' });
    vi.mocked(attempts.findByOrderId).mockRejectedValue(new Error('multiple'));
    await expect(service().resumeAttempt('order-1')).resolves.toEqual({ type: 'unknown', reason: 'inconsistent-attempt' });
  });

  it('rejects two different adapter objects claiming one provider', () => {
    expect(() => service(adapter, [{ ...adapter }])).toThrow(/Multiple payment adapters/);
  });
});

describe('PaymentService durable notification acceptance', () => {
  beforeEach(() => {
    vi.mocked(adapter.verifyWebhook).mockReturnValue(true);
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({
      type: 'order.completed', provider: 'cryptocloud', sourceEventId: null, occurredAt: null,
      identity, correlationAttemptId: 'attempt-1', providerTestMode: false,
    });
    vi.mocked(attempts.findByIdentity).mockResolvedValue({
      ...readyAttempt, creationState: 'unknown', creationFailureCode: 'provider-timeout',
    });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'paid' });
  });

  it('stores normalized facts and acknowledges without provider or fulfillment work', async () => {
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).resolves.toEqual({
      type: 'accepted', notificationId: 'notification-1', duplicate: false,
    });
    expect(notifications.store).toHaveBeenCalledOnce();
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('reports a duplicate only after the durable read succeeds', async () => {
    vi.mocked(notifications.store).mockResolvedValue({ inserted: false, record: notification });
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).resolves.toEqual({
      type: 'accepted', notificationId: 'notification-1', duplicate: true,
    });
  });

  it('rejects an invalid signature before parsing or persistence', async () => {
    vi.mocked(adapter.verifyWebhook).mockReturnValue(false);
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).resolves.toEqual({ type: 'invalid-signature' });
    expect(adapter.parseWebhookEvent).not.toHaveBeenCalled();
    expect(notifications.store).not.toHaveBeenCalled();
  });

  it('propagates persistence failure so the route cannot acknowledge', async () => {
    vi.mocked(notifications.store).mockRejectedValue(new Error('database unavailable'));
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).rejects.toThrow('database unavailable');
  });
});

describe('PaymentService notification worker', () => {
  beforeEach(() => {
    vi.mocked(notifications.claimNext).mockResolvedValueOnce(claim).mockResolvedValue(null);
    vi.mocked(attempts.findByIdentity).mockResolvedValue(readyAttempt);
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'paid' });
  });

  it('binds, validates, fulfills, and completes a claimed notification', async () => {
    await expect(service().processPendingNotifications()).resolves.toEqual({
      claimed: 1, completed: 1, rejected: 0, retried: 0, exhausted: 0,
    });
    expect(notifications.bind).toHaveBeenCalledWith(claim, 'attempt-1', 'order-1');
    expect(fulfillment.fulfillOrder).toHaveBeenCalledWith('order-1', '["cryptocloud","production","INV-1"]', 'attempt-1');
    expect(notifications.complete).toHaveBeenCalledWith(claim, 'fulfilled', NOW);
  });

  it('records but does not apply an adjustment notification', async () => {
    const adjustmentClaim: PaymentNotificationClaim = { ...claim, eventType: 'payment.adjustment', provider: 'paddle',
      environment: 'sandbox', providerTransactionId: 'txn-1', correlationAttemptId: null,
      adjustmentProviderId: 'adj-1', adjustmentAction: 'refund', adjustmentStatus: 'approved',
      adjustmentAmountCents: 500, adjustmentCurrency: 'USD', adjustmentUpdatedAt: NOW };
    vi.mocked(notifications.claimNext).mockReset().mockResolvedValueOnce(adjustmentClaim).mockResolvedValue(null);
    vi.mocked(attempts.findByIdentity).mockResolvedValue({ ...readyAttempt, provider: 'paddle', environment: 'sandbox',
      providerTransactionId: 'txn-1' });

    await expect(service().processPendingNotifications()).resolves.toEqual(expect.objectContaining({ completed: 1 }));

    expect(adjustments.record).toHaveBeenCalledWith(expect.objectContaining({ providerAdjustmentId: 'adj-1',
      action: 'refund', status: 'approved', amountCents: 500 }), 'attempt-1');
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
    expect(notifications.complete).toHaveBeenCalledWith(adjustmentClaim, 'adjustment-recorded', NOW);
  });

  it('retries early callbacks and provider failures instead of rejecting them', async () => {
    vi.mocked(attempts.findByIdentity).mockResolvedValue(null);
    await expect(service().processPendingNotifications()).resolves.toEqual(expect.objectContaining({ retried: 1 }));
    expect(notifications.retry).toHaveBeenCalledWith(
      claim, 'unknown-transaction', NOW, new Date(NOW.getTime() + 60_000), 10,
    );
  });

  it('rejects a correlation mismatch before receipt retrieval', async () => {
    const mismatch = { ...claim, correlationAttemptId: 'attempt-swapped' };
    vi.mocked(notifications.claimNext).mockReset().mockResolvedValueOnce(mismatch).mockResolvedValue(null);
    await expect(service().processPendingNotifications()).resolves.toEqual(expect.objectContaining({ rejected: 1 }));
    expect(notifications.reject).toHaveBeenCalledWith(mismatch, 'mismatched-transaction', NOW);
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('retries thrown fulfillment and exhausts the final attempt', async () => {
    const finalClaim = { ...claim, processingAttempts: 10 };
    vi.mocked(notifications.claimNext).mockReset().mockResolvedValueOnce(finalClaim).mockResolvedValue(null);
    vi.mocked(fulfillment.fulfillOrder).mockRejectedValue(new Error('commit interrupted'));
    vi.mocked(notifications.retry).mockResolvedValue('exhausted');
    await expect(service().processPendingNotifications()).resolves.toEqual(expect.objectContaining({ exhausted: 1 }));
    expect(notifications.retry).toHaveBeenCalledWith(finalClaim, 'fulfillment-failed', NOW, expect.any(Date), 10);
  });

  it('rejects order-not-pending with its own paid-exception resolution', async () => {
    vi.mocked(fulfillment.fulfillOrder).mockResolvedValue({ type: 'order-not-pending' });
    await expect(service().processPendingNotifications()).resolves.toEqual(expect.objectContaining({ rejected: 1 }));
    expect(notifications.reject).toHaveBeenCalledWith(claim, 'order-not-pending', NOW);
    expect(notifications.complete).not.toHaveBeenCalled();
  });
});

describe('PaymentService payment reconciliation', () => {
  it('uses the stored provider and enqueues a paid bound attempt without creating payment', async () => {
    vi.mocked(attempts.findForReconciliation).mockResolvedValue([readyAttempt]);
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'paid' });
    await expect(service().reconcilePaymentAttempts()).resolves.toEqual({
      inspected: 1, enqueuedPaid: 1, markedUnknown: 0, markedFailed: 0, providerErrors: 0,
    });
    expect(notifications.store).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'reconciliation:["cryptocloud","production","INV-1"]', correlationAttemptId: 'attempt-1',
    }), NOW);
    expect(adapter.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('marks stale unbound creation unknown and preserves unbound unknown attempts', async () => {
    vi.mocked(attempts.findForReconciliation).mockResolvedValue([
      attempt, { ...attempt, id: 'attempt-2', creationState: 'unknown', creationFailureCode: 'provider-timeout' },
    ]);
    await expect(service().reconcilePaymentAttempts()).resolves.toEqual(expect.objectContaining({
      inspected: 2, markedUnknown: 1,
    }));
    expect(attempts.markCreationUnknown).toHaveBeenCalledWith('attempt-1', 'stale-creating');
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('lists unbound unknown attempts for operators without feeding them into recurring reconciliation', async () => {
    const unresolved: PaymentAttemptRecord = {
      ...attempt, creationState: 'unknown', creationFailureCode: 'provider-timeout',
    };
    vi.mocked(attempts.listUnresolved).mockResolvedValue([unresolved]);
    await expect(service().getOperatorStatus({ limit: 50 })).resolves.toEqual({
      notifications: { items: [], nextCursor: null }, unresolvedAttempts: [unresolved],
    });
    expect(attempts.listUnresolved).toHaveBeenCalledWith(100);
    expect(attempts.findForReconciliation).not.toHaveBeenCalled();
  });
});
