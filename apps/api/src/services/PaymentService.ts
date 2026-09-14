import type { PaymentCreationFailureCode, PaymentIdentity, PaymentProvider } from 'server/domain/Payment';
import { paymentIdentityKey } from 'server/domain/Payment';
import { validateReceiptAgainstAttempt } from 'server/domain/PaymentReceipt';
import { paymentNotificationRetryAt, toStoredPaymentEvent } from 'server/domain/PaymentNotification';
import type {
  PaymentNotificationResolution,
  StoredPaymentEvent,
} from 'server/domain/PaymentNotification';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { PaymentCreationError } from 'server/providers/payment/PaymentAdapter';
import { paymentAdapter, paymentWebhookAdapters } from 'server/providers/payment/activeAdapter';
import type {
  IPaymentAttemptRepository,
  PaymentAttemptRecord,
  PaymentAttemptWriteClient,
} from 'server/repositories/PaymentAttemptRepository';
import { paymentAttemptRepository } from 'server/repositories/PaymentAttemptRepository';
import type {
  IPaymentNotificationRepository,
  PaymentNotificationClaim,
  PaymentNotificationListInput,
  PaymentNotificationListResult,
  PaymentNotificationRecord,
} from 'server/repositories/PaymentNotificationRepository';
import { paymentNotificationRepository } from 'server/repositories/PaymentNotificationRepository';
import { PurchaseFulfillmentService, purchaseFulfillmentService } from 'server/services/PurchaseFulfillmentService';

export const PAYMENT_CREATION_LEASE_MS = 30_000;
export const PAYMENT_NOTIFICATION_CLAIM_LEASE_MS = 30_000;
export const PAYMENT_NOTIFICATION_MAX_ATTEMPTS = 10;
export const PAYMENT_RECONCILIATION_STALE_MS = 5 * 60_000;

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

export type PaymentNotificationAcceptance =
  | { type: 'invalid-signature' }
  | { type: 'accepted'; notificationId: string; duplicate: boolean };

export type PaymentNotificationRunSummary = {
  claimed: number; completed: number; rejected: number; retried: number; exhausted: number;
};
export type PaymentReconciliationSummary = {
  inspected: number; enqueuedPaid: number; markedUnknown: number; markedFailed: number; providerErrors: number;
};
export type PaymentOperatorStatus = {
  notifications: PaymentNotificationListResult;
  unresolvedAttempts: PaymentAttemptRecord[];
};

export interface IPaymentService {
  prepareAttempt(command: PreparePaymentAttemptCommand, db?: PaymentAttemptWriteClient): Promise<PaymentAttemptRecord>;
  openPreparedAttempt(command: OpenPreparedPaymentAttemptCommand): Promise<PaymentCheckoutOutcome>;
  resumeAttempt(orderId: string): Promise<PaymentCheckoutOutcome>;
  acceptVerifiedNotification(
    adapter: PaymentAdapter,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<PaymentNotificationAcceptance>;
  processPendingNotifications(limit?: number): Promise<PaymentNotificationRunSummary>;
  reconcilePaymentAttempts(limit?: number): Promise<PaymentReconciliationSummary>;
  getOperatorStatus(input: PaymentNotificationListInput): Promise<PaymentOperatorStatus>;
  replayNotification(notificationId: string): Promise<PaymentNotificationRecord | null>;
}

export class PaymentService implements IPaymentService {
  private readonly adapters = new Map<PaymentProvider, PaymentAdapter>();

  constructor(
    private attempts: IPaymentAttemptRepository,
    private notifications: IPaymentNotificationRepository,
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
  ): Promise<PaymentNotificationAcceptance> {
    if (!adapter.verifyWebhook(rawBody, headers)) return { type: 'invalid-signature' };
    const event = adapter.parseWebhookEvent(rawBody, headers);
    const stored = await this.notifications.store(toStoredPaymentEvent(event), this.now());
    return { type: 'accepted', notificationId: stored.record.id, duplicate: !stored.inserted };
  }

  async processPendingNotifications(limit = 20): Promise<PaymentNotificationRunSummary> {
    const summary: PaymentNotificationRunSummary = { claimed: 0, completed: 0, rejected: 0, retried: 0, exhausted: 0 };
    const boundedLimit = Math.max(1, Math.min(100, limit));
    while (summary.claimed < boundedLimit) {
      const claim = await this.notifications.claimNext(
        this.now(), PAYMENT_NOTIFICATION_CLAIM_LEASE_MS, PAYMENT_NOTIFICATION_MAX_ATTEMPTS,
      );
      if (claim === null) break;
      summary.claimed += 1;
      if (claim.eventType === 'order.ignored') {
        if (await this.notifications.complete(claim, 'ignored', this.now())) summary.completed += 1;
        continue;
      }
      await this.processClaim(claim, summary);
    }
    return summary;
  }

  async reconcilePaymentAttempts(limit = 50): Promise<PaymentReconciliationSummary> {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const now = this.now();
    const candidates = await this.attempts.findForReconciliation(
      now, new Date(now.getTime() - PAYMENT_RECONCILIATION_STALE_MS), boundedLimit,
    );
    const summary: PaymentReconciliationSummary = {
      inspected: candidates.length, enqueuedPaid: 0, markedUnknown: 0, markedFailed: 0, providerErrors: 0,
    };
    for (const attempt of candidates) {
      if (!hasBinding(attempt)) {
        if (attempt.creationState === 'creating' && !hasAnyBindingFact(attempt)) {
          await this.attempts.markCreationUnknown(attempt.id, 'stale-creating');
          summary.markedUnknown += 1;
        }
        continue;
      }
      const adapter = this.adapters.get(attempt.provider);
      if (adapter === undefined) { summary.providerErrors += 1; continue; }
      let receipt;
      try { receipt = await adapter.retrieveReceipt(identityFor(attempt)); }
      catch { summary.providerErrors += 1; continue; }
      if (receipt.status === 'paid' || receipt.status === 'overpaid') {
        const event: StoredPaymentEvent = {
          eventKey: `reconciliation:${paymentIdentityKey(identityFor(attempt))}`,
          eventType: 'order.completed', provider: attempt.provider, sourceEventId: null, occurredAt: null,
          environment: attempt.environment, providerTransactionId: attempt.providerTransactionId,
          correlationAttemptId: attempt.id, providerTestMode: receipt.providerTestMode,
        };
        const stored = await this.notifications.store(event, now);
        if (stored.inserted) summary.enqueuedPaid += 1;
      } else if (receipt.status === 'cancelled'
        || (receipt.status === 'unpaid' && attempt.expiresAt !== null && attempt.expiresAt <= now)) {
        await this.attempts.markCreationFailed(attempt.id,
          receipt.status === 'cancelled' ? 'provider-cancelled' : 'authoritative-expiry');
        summary.markedFailed += 1;
      }
    }
    return summary;
  }

  async getOperatorStatus(input: PaymentNotificationListInput): Promise<PaymentOperatorStatus> {
    const [notifications, unresolvedAttempts] = await Promise.all([
      this.notifications.list(input),
      this.attempts.listUnresolved(100),
    ]);
    return { notifications, unresolvedAttempts };
  }

  replayNotification(notificationId: string): Promise<PaymentNotificationRecord | null> {
    return this.notifications.replay(notificationId, this.now());
  }

  private async processClaim(claim: PaymentNotificationClaim, summary: PaymentNotificationRunSummary): Promise<void> {
    if (claim.environment === null || claim.providerTransactionId === null || claim.correlationAttemptId === null) {
      await this.recordRetry(claim, 'unknown-transaction', summary); return;
    }
    const identity: PaymentIdentity = { provider: claim.provider, environment: claim.environment,
      providerTransactionId: claim.providerTransactionId };
    const attempt = await this.attempts.findByIdentity(identity);
    if (attempt === null) { await this.recordRetry(claim, 'unknown-transaction', summary); return; }
    if (claim.correlationAttemptId !== attempt.id) {
      if (await this.notifications.reject(claim, 'mismatched-transaction', this.now())) summary.rejected += 1;
      return;
    }
    if (!await this.notifications.bind(claim, attempt.id, attempt.orderId)) return;
    const adapter = this.adapters.get(claim.provider);
    if (adapter === undefined) { await this.recordRetry(claim, 'provider-unreachable', summary); return; }
    let receipt;
    try { receipt = await adapter.retrieveReceipt(identity); }
    catch { await this.recordRetry(claim, 'provider-unreachable', summary); return; }
    const validation = validateReceiptAgainstAttempt(receipt, attempt, adapter.expectedAccountId());
    if (!validation.ok) {
      if (await this.notifications.reject(claim, 'rejected-receipt', this.now())) summary.rejected += 1;
      return;
    }
    let resolution: PaymentNotificationResolution;
    try {
      const outcome = await this.fulfillment.fulfillOrder(attempt.orderId, paymentIdentityKey(identity));
      if (outcome.type === 'unknown-order') {
        if (await this.notifications.reject(claim, 'unknown-order', this.now())) summary.rejected += 1;
        return;
      }
      if (outcome.type === 'order-not-pending') {
        if (await this.notifications.reject(claim, 'order-not-pending', this.now())) summary.rejected += 1;
        return;
      }
      resolution = outcome.type === 'fulfilled' ? 'fulfilled' : 'completed-duplicate';
    } catch {
      await this.recordRetry(claim, 'fulfillment-failed', summary); return;
    }
    if (await this.notifications.complete(claim, resolution, this.now())) summary.completed += 1;
  }

  private async recordRetry(
    claim: PaymentNotificationClaim,
    code: 'unknown-transaction' | 'provider-unreachable' | 'fulfillment-failed',
    summary: PaymentNotificationRunSummary,
  ): Promise<void> {
    const now = this.now();
    const result = await this.notifications.retry(
      claim, code, now, paymentNotificationRetryAt(now, claim.processingAttempts),
      PAYMENT_NOTIFICATION_MAX_ATTEMPTS,
    );
    if (result === 'retry-wait') summary.retried += 1;
    if (result === 'exhausted') summary.exhausted += 1;
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
  paymentNotificationRepository,
  paymentAdapter,
  paymentWebhookAdapters,
  purchaseFulfillmentService,
);
