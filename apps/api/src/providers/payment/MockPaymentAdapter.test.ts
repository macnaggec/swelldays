import { describe, expect, it } from 'vitest';
import { mockPaymentAdapter } from './MockPaymentAdapter';

describe('MockPaymentAdapter', () => {
  it('returns a completed durable identity without making a self-webhook request', async () => {
    const first = await mockPaymentAdapter.createCheckoutSession({
      paymentAttemptId: 'attempt-1', totalCents: 100,
      successUrl: 'https://example.test/success', failUrl: 'https://example.test/fail',
    });
    const second = await mockPaymentAdapter.createCheckoutSession({
      paymentAttemptId: 'attempt-2', totalCents: 100,
      successUrl: 'https://example.test/success', failUrl: 'https://example.test/fail',
    });
    expect(first).toEqual(expect.objectContaining({
      environment: 'test', settlement: 'completed', expiresAt: null, providerTestMode: null,
    }));
    expect(first.providerTransactionId).not.toBe(second.providerTransactionId);
  });
});

describe('MockPaymentAdapter.retrieveReceipt', () => {
  it('mirrors the amount from the most recently created session as a paid receipt', async () => {
    await mockPaymentAdapter.createCheckoutSession({
      paymentAttemptId: 'attempt-mirror',
      totalCents: 4200,
      successUrl: 'https://example.test/success',
      failUrl: 'https://example.test/fail',
    });
    const identity = {
      provider: 'mock' as const,
      environment: 'test' as const,
      providerTransactionId: 'mock-fixture',
    };

    await expect(mockPaymentAdapter.retrieveReceipt(identity)).resolves.toEqual({
      identity,
      status: 'paid',
      paidTotalCents: 4200,
      paidCurrency: 'USD',
      subtotalCents: null,
      taxCents: null,
      discountCents: null,
      settlementNetCents: null,
      providerAccountId: null,
      providerTestMode: true,
    });
  });
});

describe('MockPaymentAdapter.expectedAccountId', () => {
  it('returns null', () => {
    expect(mockPaymentAdapter.expectedAccountId()).toBeNull();
  });
});
