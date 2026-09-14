import { describe, expect, it } from 'vitest';
import { PAYMENT_NOTIFICATION_RESOLUTIONS, paymentNotificationRetryAt, toStoredPaymentEvent } from './PaymentNotification';

const completed = {
  type: 'order.completed' as const,
  provider: 'cryptocloud' as const,
  sourceEventId: null,
  occurredAt: null,
  identity: {
    provider: 'cryptocloud' as const,
    environment: 'production' as const,
    providerTransactionId: 'INV-1',
  },
  correlationAttemptId: 'attempt-1',
  providerTestMode: false,
};

describe('payment notification normalization', () => {
  it('uses a bounded provider event id when available', () => {
    const stored = toStoredPaymentEvent({ ...completed, provider: 'paddle', sourceEventId: 'evt_1', identity: {
      provider: 'paddle', environment: 'sandbox', providerTransactionId: 'txn_1',
    } });
    expect(stored.eventKey).toBe('event:paddle:evt_1');
  });

  it('uses stable normalized facts when source id is absent or unusable', () => {
    const first = toStoredPaymentEvent(completed);
    const second = toStoredPaymentEvent({ ...completed, providerTestMode: true });
    expect(first.eventKey).toBe(second.eventKey);
    expect(toStoredPaymentEvent({ ...completed, sourceEventId: ' '.repeat(5) }).eventKey).toBe(first.eventKey);
    expect(toStoredPaymentEvent({ ...completed, sourceEventId: 'x'.repeat(201) }).eventKey).toBe(first.eventKey);
  });

  it('backs off exponentially and caps at one hour', () => {
    const now = new Date('2026-09-14T00:00:00Z');
    expect(paymentNotificationRetryAt(now, 1)).toEqual(new Date('2026-09-14T00:01:00Z'));
    expect(paymentNotificationRetryAt(now, 3)).toEqual(new Date('2026-09-14T00:04:00Z'));
    expect(paymentNotificationRetryAt(now, 20)).toEqual(new Date('2026-09-14T01:00:00Z'));
  });

  it('keeps paid non-pending orders visible as their own resolution', () => {
    expect(PAYMENT_NOTIFICATION_RESOLUTIONS).toContain('order-not-pending');
  });
});
