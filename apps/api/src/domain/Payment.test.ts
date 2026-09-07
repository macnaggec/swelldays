import { describe, expect, it } from 'vitest';
import { paymentIdentityKey } from 'server/domain/Payment';

describe('paymentIdentityKey', () => {
  it('encodes every identity component without delimiter collisions', () => {
    expect(paymentIdentityKey({
      provider: 'cryptocloud',
      environment: 'production',
      providerTransactionId: 'INV:one/two',
    })).toBe('["cryptocloud","production","INV:one/two"]');
  });
});
