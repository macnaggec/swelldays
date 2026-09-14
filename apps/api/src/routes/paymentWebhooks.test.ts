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
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'accepted', notificationId: 'n1', duplicate: false }) };
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

  it('maps invalid signatures to 401', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'invalid-signature' }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    expect((await router.request('/cryptocloud', { method: 'POST', body: '{}' })).status).toBe(401);
  });

  it('does not rate-limit a valid provider burst', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'accepted', notificationId: 'n1', duplicate: false }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const responses = await Promise.all(Array.from({ length: 25 }, () =>
      router.request('/cryptocloud', { method: 'POST', body: '{}' })));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(payments.acceptVerifiedNotification).toHaveBeenCalledTimes(25);
  });

  it('rejects an oversized body with 413 without calling the service', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockResolvedValue({ type: 'accepted', notificationId: 'n1', duplicate: false }) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const oversizedBody = 'a'.repeat(65_537);

    const response = await router.request('/cryptocloud', { method: 'POST', body: oversizedBody });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'Payload too large' });
    expect(payments.acceptVerifiedNotification).not.toHaveBeenCalled();
  });

  it('never acknowledges a persistence failure and keeps its response generic', async () => {
    const cryptoCloud = adapter('cryptocloud');
    const payments = { acceptVerifiedNotification: vi.fn().mockRejectedValue(new Error('private detail')) };
    const router = createPaymentWebhookRouter({ adapters: [cryptoCloud], payments });
    const response = await router.request('/cryptocloud', { method: 'POST', body: '{}' });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Payment processing error' });
  });
});
