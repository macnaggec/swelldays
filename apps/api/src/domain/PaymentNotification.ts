import { createHash } from 'node:crypto';
import type { PaymentEnvironment, PaymentIdentity, PaymentProvider } from 'server/domain/Payment';
import type { NormalizedPaymentAdjustment } from 'server/domain/PaymentAdjustment';

export const PAYMENT_NOTIFICATION_STATUSES = [
  'received', 'processing', 'retry-wait', 'completed', 'rejected', 'exhausted',
] as const;
export type PaymentNotificationStatus = (typeof PAYMENT_NOTIFICATION_STATUSES)[number];

export const PAYMENT_NOTIFICATION_RESOLUTIONS = [
  'fulfilled', 'completed-duplicate', 'ignored', 'unknown-order',
  'order-not-pending', 'mismatched-transaction', 'rejected-receipt',
  'fulfilled-with-exceptions', 'adjustment-recorded',
] as const;
export type PaymentNotificationResolution = (typeof PAYMENT_NOTIFICATION_RESOLUTIONS)[number];

export const PAYMENT_NOTIFICATION_ERROR_CODES = [
  'unknown-transaction', 'provider-unreachable', 'fulfillment-failed', 'claim-lost',
  'adjustment-failed',
] as const;
export type PaymentNotificationErrorCode = (typeof PAYMENT_NOTIFICATION_ERROR_CODES)[number];

export type NormalizedPaymentWebhookEvent =
  | {
      type: 'order.completed';
      provider: PaymentProvider;
      sourceEventId: string | null;
      occurredAt: Date | null;
      identity: PaymentIdentity;
      correlationAttemptId: string;
      providerTestMode: boolean | null;
    }
  | {
      type: 'order.ignored';
      provider: PaymentProvider;
      sourceEventId: string | null;
      occurredAt: Date | null;
      identity: PaymentIdentity | null;
    }
  | {
      type: 'payment.adjustment';
      provider: 'paddle';
      sourceEventId: string;
      occurredAt: Date;
      identity: PaymentIdentity;
      adjustment: NormalizedPaymentAdjustment;
    };

export type StoredPaymentEvent = {
  eventKey: string;
  eventType: NormalizedPaymentWebhookEvent['type'];
  provider: PaymentProvider;
  sourceEventId: string | null;
  occurredAt: Date | null;
  environment: PaymentEnvironment | null;
  providerTransactionId: string | null;
  correlationAttemptId: string | null;
  providerTestMode: boolean | null;
  adjustmentProviderId: string | null;
  adjustmentAction: string | null;
  adjustmentStatus: string | null;
  adjustmentAmountCents: number | null;
  adjustmentCurrency: string | null;
  adjustmentUpdatedAt: Date | null;
};

export function toStoredPaymentEvent(event: NormalizedPaymentWebhookEvent): StoredPaymentEvent {
  const sourceEventId = event.sourceEventId?.trim();
  const usableSourceId = sourceEventId !== undefined && sourceEventId.length > 0 && sourceEventId.length <= 200
    ? sourceEventId
    : null;
  const identity = event.identity;
  const correlationAttemptId = event.type === 'order.completed' ? event.correlationAttemptId : null;
  const adjustment = event.type === 'payment.adjustment' ? event.adjustment : null;
  const eventKey = usableSourceId === null
    ? `fallback:${createHash('sha256').update(JSON.stringify([
      event.provider,
      event.type,
      identity?.environment ?? null,
      identity?.providerTransactionId ?? null,
      correlationAttemptId,
      adjustment?.providerAdjustmentId ?? null,
      adjustment?.action ?? null,
      adjustment?.status ?? null,
      adjustment?.amountCents ?? null,
      adjustment?.currency ?? null,
      adjustment?.updatedAt.toISOString() ?? null,
    ])).digest('hex')}`
    : `event:${event.provider}:${usableSourceId}`;
  return {
    eventKey,
    eventType: event.type,
    provider: event.provider,
    sourceEventId: usableSourceId,
    occurredAt: event.occurredAt,
    environment: identity?.environment ?? null,
    providerTransactionId: identity?.providerTransactionId ?? null,
    correlationAttemptId,
    providerTestMode: event.type === 'order.completed' ? event.providerTestMode : null,
    adjustmentProviderId: adjustment?.providerAdjustmentId ?? null,
    adjustmentAction: adjustment?.action ?? null,
    adjustmentStatus: adjustment?.status ?? null,
    adjustmentAmountCents: adjustment?.amountCents ?? null,
    adjustmentCurrency: adjustment?.currency ?? null,
    adjustmentUpdatedAt: adjustment?.updatedAt ?? null,
  };
}

export function paymentNotificationRetryAt(now: Date, processingAttempts: number): Date {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, processingAttempts - 1));
  return new Date(now.getTime() + delayMinutes * 60_000);
}
