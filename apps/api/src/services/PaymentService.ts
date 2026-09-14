import type { PaymentCreationFailureCode, PaymentIdentity, PaymentProvider } from 'server/domain/Payment';
import { paymentIdentityKey } from 'server/domain/Payment';
import type { ReceiptRejection } from 'server/domain/PaymentReceipt';
import { validateReceiptAgainstAttempt } from 'server/domain/PaymentReceipt';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { PaymentCreationError } from 'server/providers/payment/PaymentAdapter';
import { paymentAdapter, paymentWebhookAdapters } from 'server/providers/payment/activeAdapter';
import type {
  IPaymentAttemptRepository,
  PaymentAttemptRecord,
  PaymentAttemptWriteClient,
} from 'server/repositories/PaymentAttemptRepository';
import { paymentAttemptRepository } from 'server/repositories/PaymentAttemptRepository';
import { PurchaseFulfillmentService, purchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';
import { logger } from 'server/lib/logger';

export const PAYMENT_CREATION_LEASE_MS = 30_000;

export type PreparePaymentAttemptCommand = { orderId: string; totalCents: number };
export type OpenPreparedPaymentAttemptCommand = {
  attemptId: string;
  successUrl: string;
  failUrl: string;
};

export type PaymentCheckoutOutcome =
  | { type: 'ready'; checkoutUrl: string; expiresAt: Date | null }
  | { type: 'creating' }
  | { type: 'unknown'; reason: PaymentCreationFailureCode }
  | { type: 'definitively-failed'; reason: PaymentCreationFailureCode }
  | { type: 'payment-received' };

export type PaymentNotificationOutcome =
  | { type: 'invalid-signature' }
  | { type: 'ignored' }
  | { type: 'unknown-transaction' }
  | { type: 'mismatched-correlation' }
  | { type: 'rejected-receipt'; reason: ReceiptRejection['reason'] }
  | { type: 'provider-unreachable' }
  | { type: 'fulfilled' };

export interface IPaymentService {
  prepareAttempt(command: PreparePaymentAttemptCommand, db?: PaymentAttemptWriteClient): Promise<PaymentAttemptRecord>;
  openPreparedAttempt(command: OpenPreparedPaymentAttemptCommand): Promise<PaymentCheckoutOutcome>;
  resumeAttempt(orderId: string): Promise<PaymentCheckoutOutcome>;
  acceptVerifiedNotification(
    adapter: PaymentAdapter,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentNotificationOutcome>;
}

export class PaymentService implements IPaymentService {
  private readonly adapters = new Map<PaymentProvider, PaymentAdapter>();

  constructor(
    private attempts: IPaymentAttemptRepository,
    private checkoutAdapter: PaymentAdapter,
    knownAdapters: readonly PaymentAdapter[],
    private fulfillment: Pick<PurchaseFulfillmentService, 'fulfillOrder'>,
    private now: () => Date = () => new Date(),
  ) {
    for (const adapter of [checkoutAdapter, ...knownAdapters]) {
      const existing = this.adapters.get(adapter.provider);
      if (existing !== undefined && existing !== adapter) {
        throw new Error(`Multiple payment adapters claim provider ${adapter.provider}`);
      }
      this.adapters.set(adapter.provider, adapter);
    }
  }

  prepareAttempt(
    command: PreparePaymentAttemptCommand,
    db?: PaymentAttemptWriteClient,
  ): Promise<PaymentAttemptRecord> {
    return this.attempts.prepareAttempt({
      orderId: command.orderId,
      provider: this.checkoutAdapter.provider,
      expectedAmountCents: command.totalCents,
      expectedCurrency: 'USD',
    }, db);
  }

  async openPreparedAttempt(
    command: OpenPreparedPaymentAttemptCommand,
  ): Promise<PaymentCheckoutOutcome> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (attempt === null) return { type: 'unknown', reason: 'missing-attempt' };
    if (attempt.provider !== this.checkoutAdapter.provider) {
      return { type: 'unknown', reason: 'inconsistent-attempt' };
    }
    if (attempt.creationState !== 'creating' || hasBinding(attempt)) {
      return this.outcomeForStoredAttempt(attempt);
    }
    if (hasAnyBindingFact(attempt)) {
      return { type: 'unknown', reason: 'inconsistent-attempt' };
    }
    if (this.now().getTime() - attempt.createdAt.getTime() >= PAYMENT_CREATION_LEASE_MS) {
      const stale = await this.attempts.markCreationUnknown(attempt.id, 'stale-creating');
      return outcomeFromTerminalRecord(stale, 'stale-creating');
    }

    let session;
    try {
      session = await this.checkoutAdapter.createCheckoutSession({
        paymentAttemptId: attempt.id,
        totalCents: attempt.expectedAmountCents,
        successUrl: command.successUrl,
        failUrl: command.failUrl,
      });
    } catch (err) {
      if (err instanceof PaymentCreationError && err.certainty === 'definitively-failed') {
        const failed = await this.attempts.markCreationFailed(attempt.id, err.failureCode);
        return outcomeFromTerminalRecord(failed, err.failureCode);
      }
      const code = err instanceof PaymentCreationError ? err.failureCode : 'provider-unreachable';
      const unknown = await this.attempts.markCreationUnknown(attempt.id, code);
      return outcomeFromTerminalRecord(unknown, code);
    }

    let bound: PaymentAttemptRecord;
    try {
      bound = await this.attempts.bindProviderSession({
        attemptId: attempt.id,
        environment: session.environment,
        providerTransactionId: session.providerTransactionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt: session.expiresAt,
        providerTestMode: session.providerTestMode,
      });
    } catch {
      const unknown = await this.attempts.markCreationUnknown(attempt.id, 'local-persistence-failed');
      return outcomeFromTerminalRecord(unknown, 'local-persistence-failed');
    }

    if (session.settlement === 'completed') {
      await this.fulfillment.fulfillOrder(bound.orderId, paymentIdentityKey({
        provider: bound.provider,
        environment: session.environment,
        providerTransactionId: session.providerTransactionId,
      }));
    }
    return { type: 'ready', checkoutUrl: session.checkoutUrl, expiresAt: session.expiresAt };
  }

  async resumeAttempt(orderId: string): Promise<PaymentCheckoutOutcome> {
    let attempt: PaymentAttemptRecord | null;
    try {
      attempt = await this.attempts.findByOrderId(orderId);
    } catch {
      return { type: 'unknown', reason: 'inconsistent-attempt' };
    }
    if (attempt === null) return { type: 'unknown', reason: 'missing-attempt' };
    return this.outcomeForStoredAttempt(attempt);
  }

  private async outcomeForStoredAttempt(attempt: PaymentAttemptRecord): Promise<PaymentCheckoutOutcome> {
    if (attempt.creationState === 'creating') {
      if (this.now().getTime() - attempt.createdAt.getTime() < PAYMENT_CREATION_LEASE_MS) {
        return { type: 'creating' };
      }
      const stale = await this.attempts.markCreationUnknown(attempt.id, 'stale-creating');
      return outcomeFromTerminalRecord(stale, 'stale-creating');
    }
    if (attempt.creationState === 'unknown') {
      return { type: 'unknown', reason: attempt.creationFailureCode ?? 'inconsistent-attempt' };
    }
    if (attempt.creationState === 'definitively-failed') {
      return { type: 'definitively-failed', reason: attempt.creationFailureCode ?? 'inconsistent-attempt' };
    }
    if (!hasBinding(attempt)) return { type: 'unknown', reason: 'inconsistent-attempt' };

    if (attempt.expiresAt !== null && attempt.expiresAt.getTime() > this.now().getTime()) {
      return { type: 'ready', checkoutUrl: attempt.checkoutUrl, expiresAt: attempt.expiresAt };
    }

    const adapter = this.adapters.get(attempt.provider);
    if (adapter === undefined) return { type: 'unknown', reason: 'inconsistent-attempt' };
    let receipt;
    try {
      receipt = await adapter.retrieveReceipt(identityFor(attempt));
    } catch {
      return { type: 'unknown', reason: 'provider-unreachable' };
    }

    if (receipt.status === 'paid' || receipt.status === 'overpaid') {
      const validation = validateReceiptAgainstAttempt(receipt, attempt, adapter.expectedAccountId());
      return validation.ok
        ? { type: 'payment-received' }
        : { type: 'unknown', reason: 'inconsistent-attempt' };
    }
    if (receipt.status === 'cancelled') {
      const failed = await this.attempts.markCreationFailed(attempt.id, 'provider-cancelled');
      return outcomeFromTerminalRecord(failed, 'provider-cancelled');
    }
    if (attempt.expiresAt !== null) {
      const failed = await this.attempts.markCreationFailed(attempt.id, 'authoritative-expiry');
      return outcomeFromTerminalRecord(failed, 'authoritative-expiry');
    }
    return { type: 'ready', checkoutUrl: attempt.checkoutUrl, expiresAt: null };
  }

  async acceptVerifiedNotification(
    adapter: PaymentAdapter,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentNotificationOutcome> {
    if (!adapter.verifyWebhook(rawBody, headers)) return { type: 'invalid-signature' };
    const event = adapter.parseWebhookEvent(rawBody, headers);
    if (event.type === 'order.ignored') return { type: 'ignored' };

    const attempt = await this.attempts.findByIdentity(event.identity);
    if (attempt === null) return { type: 'unknown-transaction' };
    if (event.correlationAttemptId !== attempt.id) return { type: 'mismatched-correlation' };

    let receipt;
    try {
      receipt = await adapter.retrieveReceipt(event.identity);
    } catch (err) {
      logger.error('[PaymentService] Receipt retrieval failed', { err, attemptId: attempt.id });
      return { type: 'provider-unreachable' };
    }

    const validation = validateReceiptAgainstAttempt(receipt, attempt, adapter.expectedAccountId());
    if (!validation.ok) {
      logger.error('[PaymentService] Receipt rejected', {
        attemptId: attempt.id,
        reason: validation.rejection.reason,
      });
      return { type: 'rejected-receipt', reason: validation.rejection.reason };
    }

    await this.fulfillment.fulfillOrder(attempt.orderId, paymentIdentityKey(event.identity));
    return { type: 'fulfilled' };
  }
}

function hasBinding(attempt: PaymentAttemptRecord): attempt is PaymentAttemptRecord & {
  environment: NonNullable<PaymentAttemptRecord['environment']>;
  providerTransactionId: string;
  checkoutUrl: string;
} {
  return attempt.environment !== null
    && attempt.providerTransactionId !== null
    && attempt.checkoutUrl !== null;
}

function hasAnyBindingFact(attempt: PaymentAttemptRecord): boolean {
  return attempt.environment !== null
    || attempt.providerTransactionId !== null
    || attempt.checkoutUrl !== null
    || attempt.expiresAt !== null
    || attempt.providerTestMode !== null;
}

function identityFor(attempt: PaymentAttemptRecord & {
  environment: NonNullable<PaymentAttemptRecord['environment']>;
  providerTransactionId: string;
}): PaymentIdentity {
  return {
    provider: attempt.provider,
    environment: attempt.environment,
    providerTransactionId: attempt.providerTransactionId,
  };
}

function outcomeFromTerminalRecord(
  record: PaymentAttemptRecord,
  fallback: PaymentCreationFailureCode,
): PaymentCheckoutOutcome {
  if (record.creationState === 'ready' && hasBinding(record)) {
    return { type: 'ready', checkoutUrl: record.checkoutUrl, expiresAt: record.expiresAt };
  }
  if (record.creationState === 'definitively-failed') {
    return { type: 'definitively-failed', reason: record.creationFailureCode ?? fallback };
  }
  return { type: 'unknown', reason: record.creationFailureCode ?? fallback };
}

export const paymentService = new PaymentService(
  paymentAttemptRepository,
  paymentAdapter,
  paymentWebhookAdapters,
  purchaseFulfillmentService,
);
