import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import type { IPaymentAttemptRepository, PaymentAttemptRecord } from 'server/repositories/PaymentAttemptRepository';
import { PaymentService } from 'server/services/PaymentService';

const attempt: PaymentAttemptRecord = {
  id: 'attempt-1',
  orderId: 'order-1',
  provider: 'cryptocloud',
  environment: null,
  providerTransactionId: null,
  checkoutUrl: null,
  expiresAt: null,
  expectedAmountCents: 1500,
  expectedCurrency: 'USD',
  providerTestMode: null,
};

const attempts: IPaymentAttemptRepository = {
  createAttempt: vi.fn(),
  bindProviderSession: vi.fn(),
  findByIdentity: vi.fn(),
};
const adapter: PaymentAdapter = {
  provider: 'cryptocloud',
  createCheckoutSession: vi.fn(),
  verifyWebhook: vi.fn(),
  parseWebhookEvent: vi.fn(),
  retrieveReceipt: vi.fn(),
  expectedAccountId: vi.fn(),
};
const fulfillment = { fulfillOrder: vi.fn() };
const service = new PaymentService(attempts, adapter, fulfillment);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(attempts.createAttempt).mockResolvedValue(attempt);
  vi.mocked(attempts.bindProviderSession).mockImplementation(async (data) => ({
    ...attempt,
    environment: data.environment,
    providerTransactionId: data.providerTransactionId,
    checkoutUrl: data.checkoutUrl,
    expiresAt: data.expiresAt,
    providerTestMode: data.providerTestMode,
  }));
  vi.mocked(adapter.createCheckoutSession).mockResolvedValue({
    providerTransactionId: 'INV-1',
    environment: 'production',
    checkoutUrl: 'https://pay.example/INV-1',
    expiresAt: new Date('2026-09-07T18:00:00Z'),
    settlement: 'pending',
    providerTestMode: false,
  });
});

describe('PaymentService.createAttempt', () => {
  it('durably creates the local attempt before asking the provider and binds its result', async () => {
    await service.createAttempt({
      orderId: 'order-1',
      totalCents: 1500,
      successUrl: 'https://example.test/success',
      failUrl: 'https://example.test/fail',
    });

    expect(vi.mocked(attempts.createAttempt).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(adapter.createCheckoutSession).mock.invocationCallOrder[0]!);
    expect(adapter.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      paymentAttemptId: 'attempt-1',
    }));
    expect(attempts.bindProviderSession).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: 'attempt-1',
      providerTransactionId: 'INV-1',
      checkoutUrl: 'https://pay.example/INV-1',
    }));
  });

  it('fulfills immediate mock settlement only after binding the identity', async () => {
    const mockAdapter: PaymentAdapter = {
      ...adapter,
      provider: 'mock',
      createCheckoutSession: vi.fn().mockResolvedValue({
        providerTransactionId: 'mock-1',
        environment: 'test',
        checkoutUrl: 'https://example.test/success',
        expiresAt: null,
        settlement: 'completed',
        providerTestMode: null,
      }),
    };
    vi.mocked(attempts.createAttempt).mockResolvedValue({ ...attempt, provider: 'mock' });
    vi.mocked(attempts.bindProviderSession).mockImplementation(async (data) => ({
      ...attempt,
      provider: 'mock',
      environment: data.environment,
      providerTransactionId: data.providerTransactionId,
      checkoutUrl: data.checkoutUrl,
      expiresAt: data.expiresAt,
      providerTestMode: data.providerTestMode,
    }));
    const mockService = new PaymentService(attempts, mockAdapter, fulfillment);

    await mockService.createAttempt({
      orderId: 'order-1', totalCents: 1500,
      successUrl: 'https://example.test/success', failUrl: 'https://example.test/fail',
    });

    expect(vi.mocked(attempts.bindProviderSession).mock.invocationCallOrder[0])
      .toBeLessThan(fulfillment.fulfillOrder.mock.invocationCallOrder[0]!);
    expect(fulfillment.fulfillOrder).toHaveBeenCalledWith(
      'order-1', '["mock","test","mock-1"]',
    );
  });
});

describe('PaymentService.acceptVerifiedNotification', () => {
  const identity = {
    provider: 'cryptocloud' as const,
    environment: 'production' as const,
    providerTransactionId: 'INV-1',
  };

  const validReceipt = {
    identity,
    status: 'paid' as const,
    paidTotalCents: 1500,
    paidCurrency: 'USD',
    subtotalCents: null,
    taxCents: null,
    discountCents: null,
    settlementNetCents: null,
    providerAccountId: null,
    providerTestMode: null,
  };

  beforeEach(() => {
    vi.mocked(adapter.verifyWebhook).mockReturnValue(true);
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({
      type: 'order.completed', identity, correlationAttemptId: 'attempt-1', providerTestMode: false,
    });
    vi.mocked(attempts.findByIdentity).mockResolvedValue({
      ...attempt, environment: 'production', providerTransactionId: 'INV-1',
    });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue(validReceipt);
    vi.mocked(adapter.expectedAccountId).mockReturnValue(null);
  });

  it('resolves by provider identity, validates the receipt, and fulfills the stored order id exactly once', async () => {
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'fulfilled' });
    expect(attempts.findByIdentity).toHaveBeenCalledWith(identity);
    expect(adapter.retrieveReceipt).toHaveBeenCalledWith(identity);
    expect(fulfillment.fulfillOrder).toHaveBeenCalledTimes(1);
    expect(fulfillment.fulfillOrder).toHaveBeenCalledWith(
      'order-1', '["cryptocloud","production","INV-1"]',
    );
  });

  it('does not fulfill an invalid signature', async () => {
    vi.mocked(adapter.verifyWebhook).mockReturnValue(false);
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'invalid-signature' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('does not fulfill an ignored event', async () => {
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({ type: 'order.ignored' });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'ignored' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('rejects swapped correlation metadata without fulfilling', async () => {
    vi.mocked(adapter.parseWebhookEvent).mockReturnValue({
      type: 'order.completed', identity, correlationAttemptId: 'attempt-for-another-order', providerTestMode: false,
    });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'mismatched-correlation' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('does not fulfill an unknown provider identity', async () => {
    vi.mocked(attempts.findByIdentity).mockResolvedValue(null);
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'unknown-transaction' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
    expect(adapter.retrieveReceipt).not.toHaveBeenCalled();
  });

  it('returns provider-unreachable and does not propagate when retrieveReceipt throws', async () => {
    vi.mocked(adapter.retrieveReceipt).mockRejectedValue(new Error('network down'));
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'provider-unreachable' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects status-not-paid without fulfilling', async () => {
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...validReceipt, status: 'unpaid' });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'status-not-paid' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects transaction-mismatch without fulfilling', async () => {
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({
      ...validReceipt,
      identity: { ...identity, providerTransactionId: 'INV-OTHER' },
    });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'transaction-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects environment-mismatch without fulfilling', async () => {
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({
      ...validReceipt,
      identity: { ...identity, environment: 'sandbox' },
    });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'environment-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects account-mismatch without fulfilling', async () => {
    vi.mocked(adapter.expectedAccountId).mockReturnValue('shop-expected');
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...validReceipt, providerAccountId: 'shop-other' });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'account-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects currency-mismatch without fulfilling', async () => {
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...validReceipt, paidCurrency: 'EUR' });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'currency-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects amount-mismatch without fulfilling', async () => {
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...validReceipt, paidTotalCents: 1499 });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'amount-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });

  it('rejects test-mode-mismatch without fulfilling', async () => {
    vi.mocked(attempts.findByIdentity).mockResolvedValue({
      ...attempt, environment: 'production', providerTransactionId: 'INV-1', providerTestMode: false,
    });
    vi.mocked(adapter.retrieveReceipt).mockResolvedValue({ ...validReceipt, providerTestMode: true });
    await expect(service.acceptVerifiedNotification(adapter, '{}', {}))
      .resolves.toEqual({ type: 'rejected-receipt', reason: 'test-mode-mismatch' });
    expect(fulfillment.fulfillOrder).not.toHaveBeenCalled();
  });
});
