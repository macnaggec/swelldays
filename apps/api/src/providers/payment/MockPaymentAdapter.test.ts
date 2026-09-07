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
