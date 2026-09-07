import { describe, expect, it, vi } from 'vitest';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { createPaymentWebhookRouter } from './paymentWebhooks';

function adapter(provider: 'cryptocloud' | 'paddle'): PaymentAdapter {
  return {
    provider,
    createCheckoutSession: vi.fn(),
    verifyWebhook: vi.fn(),
    parseWebhookEvent: vi.fn(),
    retrieveReceipt: vi.fn(),
    expectedAccountId: vi.fn(),
  };
}

describe('payment webhook router', () => {
  it('routes each provider URL only to its retained provider adapter', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const paddle = adapter('paddle');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'fulfilled' }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud, paddle], payments });

    expect((await router.request('/cryptocloud', { method: 'POST', body: '{}' })).status).toBe(200);
    expect(payments.acceptVerifiedNotification).toHaveBeenLastCalledWith(
      cryptoCloud, '{}', expect.any(Object),
    );
    expect((await router.request('/paddle', { method: 'POST', body: '{}' })).status).toBe(200);
    expect(payments.acceptVerifiedNotification).toHaveBeenLastCalledWith(
      paddle, '{}', expect.any(Object),
    );
  });

  it.each([
    ['invalid-signature', 401],
    ['unknown-transaction', 409],
    ['mismatched-correlation', 409],
    ['ignored', 200],
    ['fulfilled', 200],
    ['rejected-receipt', 409],
    ['provider-unreachable', 502],
  ] as const)('maps %s to %s', async (type, status) => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    expect((await router.request('/cryptocloud', { method: 'POST', body: '{}' })).status).toBe(status);
  });

  it('returns 409 with the validation-failed message for a rejected receipt', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = {
      acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'rejected-receipt', reason: 'amount-mismatch' }),
    };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const response = await router.request('/cryptocloud', { method: 'POST', body: '{}' });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Payment validation failed' });
  });

  it('returns 502 with the provider-unreachable message', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'provider-unreachable' }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const response = await router.request('/cryptocloud', { method: 'POST', body: '{}' });
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Payment provider unreachable' });
  });

  it('rejects an oversized body with 413 without calling the service', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'fulfilled' }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const oversizedBody = 'a'.repeat(65_537);

    const response = await router.request('/cryptocloud', { method: 'POST', body: oversizedBody });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'Payload too large' });
    expect(payments.acceptVerifiedNotification).not.toHaveBeenCalled();
  });

  it('keeps processing errors generic', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockRejectedValue(new Error('private detail')) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const response = await router.request('/cryptocloud', { method: 'POST', body: '{}' });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Payment processing error' });
  });
});
