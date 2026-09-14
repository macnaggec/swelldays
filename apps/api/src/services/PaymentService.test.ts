import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { PaymentCreationError } from 'server/providers/payment/PaymentAdapter';
import type { IPaymentAttemptRepository, PaymentAttemptRecord } from 'server/repositories/PaymentAttemptRepository';
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
};
const adapter: PaymentAdapter = {
  provider: 'cryptocloud', createCheckoutSession: vi.fn(),
  verifyWebhook: vi.fn(), parseWebhookEvent: vi.fn(),
  retrieveReceipt: vi.fn(), expectedAccountId: vi.fn(),
};
const fulfillment = { fulfillOrder: vi.fn() };
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

function service(checkout = adapter, known: readonly PaymentAdapter[] = [adapter]): PaymentService {
  return new PaymentService(attempts, checkout, known, fulfillment, () => NOW);
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
  vi.mocked(adapter.retrieveReceipt).mockResolvedValue(receipt);
  vi.mocked(adapter.expectedAccountId).mockReturnValue(null);
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

describe('PaymentService notification compatibility', () => {
  beforeEach(() => {
    vi.mocked(adapter.verifyWebhook).mockReturnValue(true);
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({
      type: 'order.completed', identity, correlationAttemptId: 'attempt-1', providerTestMode: false,
    });
    vi.mocked(attempts.findByIdentity).mockResolvedValue({
      ...readyAttempt, creationState: 'unknown', creationFailureCode: 'provider-timeout',
    });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...receipt, status: 'paid' });
  });

  it('still fulfills a validated late payment after creation became unknown', async () => {
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).resolves.toEqual({ type: 'fulfilled' });
    expect(fulfillment.fulfillOrder).toHaveBeenCalledWith(
      'order-1', '["cryptocloud","production","INV-1"]',
    );
  });

  it('still fulfills a validated late payment after creation definitively failed', async () => {
    vi.mocked(attempts.findByIdentity).mockResolvedValue({
      ...readyAttempt,
      creationState: 'definitively-failed',
      creationFailureCode: 'provider-cancelled',
    });
    await expect(service().acceptVerifiedNotification(adapter, '{}', {})).resolves.toEqual({ type: 'fulfilled' });
    expect(fulfillment.fulfillOrder).toHaveBeenCalledWith(
      'order-1', '["cryptocloud","production","INV-1"]',
    );
  });

  it('keeps identity-first and correlation checks', async () => {
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({
      type: 'order.completed', identity, correlationAttemptId: 'swapped', providerTestMode: false,
    });
    await expect(service().acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'mismatched-correlation' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });
});
