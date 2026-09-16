import { describe, expect, it } from 'vitest';
import { buyerCheckoutStatusSchema, checkoutStatusLocatorSchema } from './checkoutSchemas';

const orderId = '11111111-1111-4111-8111-111111111111';

describe('checkout status contracts', () => {
  it('accepts exactly one UUID locator', () => {
    expect(checkoutStatusLocatorSchema.safeParse({ orderId }).success).toBe(true);
    expect(checkoutStatusLocatorSchema.safeParse({ clientRequestId: orderId }).success).toBe(true);
    expect(checkoutStatusLocatorSchema.safeParse({ orderId, clientRequestId: orderId }).success).toBe(false);
    expect(checkoutStatusLocatorSchema.safeParse({ orderId: 'bad' }).success).toBe(false);
  });

  it.each([
    { state: 'not-found' },
    { state: 'ready', orderId, checkoutUrl: 'https://pay.example/checkout' },
    { state: 'creating', orderId },
    { state: 'unknown', orderId, reason: 'provider-timeout' },
    { state: 'processing', orderId },
    { state: 'paid', orderId },
    { state: 'failed', orderId, reason: 'order-failed' },
  ])('accepts $state status', (status) => {
    expect(buyerCheckoutStatusSchema.safeParse(status).success).toBe(true);
  });

  it('rejects malformed and non-strict statuses', () => {
    expect(buyerCheckoutStatusSchema.safeParse({ state: 'paid', orderId: 'bad' }).success).toBe(false);
    expect(buyerCheckoutStatusSchema.safeParse({ state: 'ready', orderId, checkoutUrl: '/relative' }).success).toBe(false);
    expect(buyerCheckoutStatusSchema.safeParse({ state: 'paid', orderId, extra: true }).success).toBe(false);
  });
});
