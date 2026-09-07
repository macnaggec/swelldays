import { describe, expect, it } from 'vitest';
import type { PaymentAttemptFacts, PaymentReceipt } from './PaymentReceipt';
import { validateReceiptAgainstAttempt } from './PaymentReceipt';

function makeReceipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    identity: {
      provider: 'cryptocloud',
      environment: 'production',
      providerTransactionId: 'INV-1',
    },
    status: 'paid',
    paidTotalCents: 1500,
    paidCurrency: 'USD',
    subtotalCents: null,
    taxCents: null,
    discountCents: null,
    settlementNetCents: null,
    providerAccountId: 'shop-1',
    providerTestMode: false,
    ...overrides,
  };
}

function makeAttempt(overrides: Partial<PaymentAttemptFacts> = {}): PaymentAttemptFacts {
  return {
    provider: 'cryptocloud',
    environment: 'production',
    providerTransactionId: 'INV-1',
    expectedAmountCents: 1500,
    expectedCurrency: 'USD',
    providerTestMode: false,
    ...overrides,
  };
}

describe('validateReceiptAgainstAttempt', () => {
  it('accepts a fully valid receipt', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt(), makeAttempt(), 'shop-1')).toEqual({ ok: true });
  });

  it('rejects status-not-paid for an unpaid receipt', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt({ status: 'unpaid' }), makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'status-not-paid', status: 'unpaid' } });
  });

  it('rejects status-not-paid for a cancelled receipt', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt({ status: 'cancelled' }), makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'status-not-paid', status: 'cancelled' } });
  });

  it('accepts an overpaid receipt at step 1', () => {
    const result = validateReceiptAgainstAttempt(
      makeReceipt({ status: 'overpaid', paidTotalCents: 1600 }),
      makeAttempt(),
      'shop-1',
    );
    expect(result).toEqual({ ok: true });
  });

  it('rejects transaction-mismatch when providers differ', () => {
    const receipt = makeReceipt({
      identity: { provider: 'paddle', environment: 'production', providerTransactionId: 'INV-1' },
    });
    expect(validateReceiptAgainstAttempt(receipt, makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'transaction-mismatch' } });
  });

  it('rejects transaction-mismatch when the attempt has no stored transaction id', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt(), makeAttempt({ providerTransactionId: null }), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'transaction-mismatch' } });
  });

  it('rejects transaction-mismatch when transaction ids differ', () => {
    const receipt = makeReceipt({
      identity: { provider: 'cryptocloud', environment: 'production', providerTransactionId: 'INV-2' },
    });
    expect(validateReceiptAgainstAttempt(receipt, makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'transaction-mismatch' } });
  });

  it('rejects environment-mismatch when the attempt has no stored environment', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt(), makeAttempt({ environment: null }), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'environment-mismatch' } });
  });

  it('rejects environment-mismatch when environments differ', () => {
    const receipt = makeReceipt({
      identity: { provider: 'cryptocloud', environment: 'sandbox', providerTransactionId: 'INV-1' },
    });
    expect(validateReceiptAgainstAttempt(receipt, makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'environment-mismatch' } });
  });

  it('rejects account-mismatch when provider account ids disagree', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt({ providerAccountId: 'shop-2' }), makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'account-mismatch' } });
  });

  it('skips account-mismatch when expectedAccountId is null', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt({ providerAccountId: 'shop-2' }), makeAttempt(), null))
      .toEqual({ ok: true });
  });

  it('rejects currency-mismatch', () => {
    expect(validateReceiptAgainstAttempt(makeReceipt({ paidCurrency: 'EUR' }), makeAttempt(), 'shop-1'))
      .toEqual({ ok: false, rejection: { reason: 'currency-mismatch' } });
  });

  it('accepts an exactly-equal amount', () => {
    expect(validateReceiptAgainstAttempt(
      makeReceipt({ paidTotalCents: 1500 }),
      makeAttempt({ expectedAmountCents: 1500 }),
      'shop-1',
    )).toEqual({ ok: true });
  });

  it('rejects amount-mismatch one cent short', () => {
    expect(validateReceiptAgainstAttempt(
      makeReceipt({ paidTotalCents: 1499 }),
      makeAttempt({ expectedAmountCents: 1500 }),
      'shop-1',
    )).toEqual({ ok: false, rejection: { reason: 'amount-mismatch' } });
  });

  it('rejects test-mode-mismatch when both sides report a definite value that disagrees', () => {
    expect(validateReceiptAgainstAttempt(
      makeReceipt({ providerTestMode: true }),
      makeAttempt({ providerTestMode: false }),
      'shop-1',
    )).toEqual({ ok: false, rejection: { reason: 'test-mode-mismatch' } });
  });

  it('skips test-mode-mismatch when the receipt does not report test mode', () => {
    expect(validateReceiptAgainstAttempt(
      makeReceipt({ providerTestMode: null }),
      makeAttempt({ providerTestMode: false }),
      'shop-1',
    )).toEqual({ ok: true });
  });

  it('skips test-mode-mismatch when the attempt does not report test mode', () => {
    expect(validateReceiptAgainstAttempt(
      makeReceipt({ providerTestMode: true }),
      makeAttempt({ providerTestMode: null }),
      'shop-1',
    )).toEqual({ ok: true });
  });
});
