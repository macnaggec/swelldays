import { describe, expect, it } from 'vitest';
import {
  PAYMENT_ATTEMPT_CREATION_STATES,
  PAYMENT_CREATION_FAILURE_CODES,
  paymentIdentityKey,
} from 'server/domain/Payment';

describe('paymentIdentityKey', () => {
  it('encodes every identity component without delimiter collisions', () => {
    expect(paymentIdentityKey({
      provider: 'cryptocloud',
      environment: 'production',
      providerTransactionId: 'INV:one/two',
    })).toBe('["cryptocloud","production","INV:one/two"]');
  });
});

describe('payment attempt creation lifecycle', () => {
  it('enumerates every durable creation state and failure code', () => {
    expect(PAYMENT_ATTEMPT_CREATION_STATES).toEqual([
      'creating', 'ready', 'unknown', 'definitively-failed',
    ]);
    expect(PAYMENT_CREATION_FAILURE_CODES).toEqual([
      'provider-rejected', 'provider-timeout', 'provider-unreachable',
      'provider-response-invalid', 'local-persistence-failed', 'stale-creating',
      'authoritative-expiry', 'provider-cancelled', 'inconsistent-attempt', 'missing-attempt',
    ]);
  });
});
