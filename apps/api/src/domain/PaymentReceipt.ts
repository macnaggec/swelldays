import type { PaymentEnvironment, PaymentIdentity, PaymentProvider } from 'server/domain/Payment';

export const RECEIPT_STATUSES = ['paid', 'overpaid', 'unpaid', 'cancelled'] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];

/**
 * What the provider authoritatively reports about a transaction, normalized.
 * Amounts are minor units of `paidCurrency`. A field is null only when the
 * provider genuinely does not report it — never as a stand-in for "unknown".
 */
export type PaymentReceipt = {
  identity: PaymentIdentity;
  status: ReceiptStatus;
  /** What the buyer was actually charged. */
  paidTotalCents: number;
  paidCurrency: string;
  /** Sticker basis before tax and discount. */
  subtotalCents: number | null;
  taxCents: number | null;
  discountCents: number | null;
  /** What the platform receives after provider fees. */
  settlementNetCents: number | null;
  /** Provider-side shop/project id, when the provider reports one. */
  providerAccountId: string | null;
  providerTestMode: boolean | null;
};

/**
 * The stored attempt's facts, declared structurally because domain modules may
 * not import repositories. PaymentAttemptRecord satisfies this.
 */
export type PaymentAttemptFacts = {
  provider: PaymentProvider;
  environment: PaymentEnvironment | null;
  providerTransactionId: string | null;
  expectedAmountCents: number;
  expectedCurrency: string;
  providerTestMode: boolean | null;
};

export type ReceiptRejection =
  | { reason: 'status-not-paid'; status: ReceiptStatus }
  | { reason: 'transaction-mismatch' }
  | { reason: 'environment-mismatch' }
  | { reason: 'account-mismatch' }
  | { reason: 'currency-mismatch' }
  | { reason: 'amount-mismatch' }
  | { reason: 'test-mode-mismatch' };

export type ReceiptValidation =
  | { ok: true }
  | { ok: false; rejection: ReceiptRejection };

export function validateReceiptAgainstAttempt(
  receipt: PaymentReceipt,
  attempt: PaymentAttemptFacts,
  expectedAccountId: string | null,
): ReceiptValidation {
  if (receipt.status !== 'paid' && receipt.status !== 'overpaid') {
    return { ok: false, rejection: { reason: 'status-not-paid', status: receipt.status } };
  }

  if (
    receipt.identity.provider !== attempt.provider
    || attempt.providerTransactionId === null
    || receipt.identity.providerTransactionId !== attempt.providerTransactionId
  ) {
    return { ok: false, rejection: { reason: 'transaction-mismatch' } };
  }

  if (attempt.environment === null || receipt.identity.environment !== attempt.environment) {
    return { ok: false, rejection: { reason: 'environment-mismatch' } };
  }

  if (
    expectedAccountId !== null
    && receipt.providerAccountId !== null
    && receipt.providerAccountId !== expectedAccountId
  ) {
    return { ok: false, rejection: { reason: 'account-mismatch' } };
  }

  if (receipt.paidCurrency !== attempt.expectedCurrency) {
    return { ok: false, rejection: { reason: 'currency-mismatch' } };
  }

  // `<` not `!==`: an overpaid crypto invoice legitimately exceeds the agreed
  // amount, while any underpayment must fail. The comparison is against the
  // buyer-charged total under tax-inclusive pricing, as recorded in
  // OrderEconomics.ts — comparing a pre-tax subtotal to the agreed amount
  // would wrongly reject valid tax-inclusive payments.
  if (receipt.paidTotalCents < attempt.expectedAmountCents) {
    return { ok: false, rejection: { reason: 'amount-mismatch' } };
  }

  if (
    attempt.providerTestMode !== null
    && receipt.providerTestMode !== null
    && receipt.providerTestMode !== attempt.providerTestMode
  ) {
    return { ok: false, rejection: { reason: 'test-mode-mismatch' } };
  }

  return { ok: true };
}
