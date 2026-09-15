import type { PaymentIdentity } from 'server/domain/Payment';
import { BadRequestError } from 'server/errors';

export const PAYMENT_ADJUSTMENT_ACTIONS = [
  'refund', 'credit', 'dispute', 'dispute-reversal',
  'warning', 'warning-reversal', 'credit-reversal',
] as const;
export type PaymentAdjustmentAction = (typeof PAYMENT_ADJUSTMENT_ACTIONS)[number];

export const PAYMENT_ADJUSTMENT_PROVIDER_STATUSES = [
  'pending-approval', 'approved', 'rejected', 'reversed',
] as const;
export type PaymentAdjustmentProviderStatus = (typeof PAYMENT_ADJUSTMENT_PROVIDER_STATUSES)[number];

export function isPaymentAdjustmentAction(value: string): value is PaymentAdjustmentAction {
  return PAYMENT_ADJUSTMENT_ACTIONS.some((candidate) => candidate === value);
}
export function isPaymentAdjustmentProviderStatus(value: string): value is PaymentAdjustmentProviderStatus {
  return PAYMENT_ADJUSTMENT_PROVIDER_STATUSES.some((candidate) => candidate === value);
}

export type NormalizedPaymentAdjustment = {
  providerAdjustmentId: string;
  identity: PaymentIdentity;
  action: PaymentAdjustmentAction;
  status: PaymentAdjustmentProviderStatus;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  updatedAt: Date;
};

export type ApplyPaymentAdjustmentCommand = {
  adjustmentId: string;
  allocations: Array<{ paidOrderLineId: string; amountCents: number }>;
  revokeEntitlements: boolean;
  reversesAdjustmentId?: string;
  note: string;
  operatorId: string;
};

export type RecordManualPaymentAdjustmentCommand = {
  paymentAttemptId: string;
  providerAdjustmentId: string;
  action: PaymentAdjustmentAction;
  status: PaymentAdjustmentProviderStatus;
  amountCents: number;
  currency: string;
  occurredAt: Date;
  updatedAt: Date;
  note: string;
  operatorId: string;
};

const ACTIONS: Record<string, PaymentAdjustmentAction> = {
  refund: 'refund', credit: 'credit', chargeback: 'dispute',
  chargeback_reverse: 'dispute-reversal', chargeback_warning: 'warning',
  chargeback_warning_reverse: 'warning-reversal', credit_reverse: 'credit-reversal',
};
const STATUSES: Record<string, PaymentAdjustmentProviderStatus> = {
  pending_approval: 'pending-approval', approved: 'approved', rejected: 'rejected', reversed: 'reversed',
};

export function mapPaddleAdjustmentAction(value: string): PaymentAdjustmentAction {
  const mapped = ACTIONS[value];
  if (mapped === undefined) throw new BadRequestError('Unsupported Paddle adjustment action');
  return mapped;
}

export function mapPaddleAdjustmentStatus(value: string): PaymentAdjustmentProviderStatus {
  const mapped = STATUSES[value];
  if (mapped === undefined) throw new BadRequestError('Unsupported Paddle adjustment status');
  return mapped;
}

export function parsePositiveMinorUnits(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new BadRequestError('Malformed payment adjustment amount');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new BadRequestError('Malformed payment adjustment amount');
  return parsed;
}

export function sellerReversalAmount(input: {
  originalAmountPaid: number;
  originalSellerEarnings: number;
  cumulativeAdjustedCustomerAmount: number;
  alreadyDebitedSellerAmount: number;
}): number {
  const { originalAmountPaid, originalSellerEarnings, cumulativeAdjustedCustomerAmount, alreadyDebitedSellerAmount } = input;
  if (![originalAmountPaid, originalSellerEarnings, cumulativeAdjustedCustomerAmount, alreadyDebitedSellerAmount]
    .every(Number.isSafeInteger) || originalAmountPaid <= 0 || originalSellerEarnings <= 0
    || cumulativeAdjustedCustomerAmount <= 0 || cumulativeAdjustedCustomerAmount > originalAmountPaid
    || alreadyDebitedSellerAmount < 0) {
    throw new BadRequestError('Invalid adjustment economics');
  }
  const cumulativeDebit = Number(
    BigInt(originalSellerEarnings) * BigInt(cumulativeAdjustedCustomerAmount) / BigInt(originalAmountPaid),
  );
  if (alreadyDebitedSellerAmount > cumulativeDebit) throw new BadRequestError('Invalid prior seller debit');
  const delta = cumulativeDebit - alreadyDebitedSellerAmount;
  return delta === 0 ? 0 : -delta;
}
