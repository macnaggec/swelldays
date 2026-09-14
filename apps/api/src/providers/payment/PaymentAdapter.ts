// ---------------------------------------------------------------------------
// Payment Provider Port — Ports & Adapters pattern
//
// Services depend on this interface, not on any concrete SDK.
// Swap providers by swapping the adapter — zero changes to business logic.
// ---------------------------------------------------------------------------

import type {
  PaymentCreationFailureCode,
  PaymentEnvironment,
  PaymentIdentity,
  PaymentProvider,
} from 'server/domain/Payment';
import type { PaymentReceipt } from 'server/domain/PaymentReceipt';

export interface CreateCheckoutParams {
  paymentAttemptId: string;
  totalCents: number;
  successUrl: string;
  failUrl: string;
}

export interface CheckoutSessionResult {
  providerTransactionId: string;
  environment: PaymentEnvironment;
  checkoutUrl: string;
  expiresAt: Date | null;
  settlement: 'pending' | 'completed';
  providerTestMode: boolean | null;
}

export type PaymentCreationCertainty = 'unknown' | 'definitively-failed';

export class PaymentCreationError extends Error {
  constructor(
    public readonly certainty: PaymentCreationCertainty,
    public readonly failureCode: Extract<
      PaymentCreationFailureCode,
      | 'provider-rejected'
      | 'provider-timeout'
      | 'provider-unreachable'
      | 'provider-response-invalid'
    >,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentCreationError';
  }
}

/**
 * Normalised webhook event — provider-agnostic identity plus a correlation
 * hint that must never select the stored attempt or order.
 */
export type PaymentWebhookEvent =
  | {
    type: 'order.completed';
    identity: PaymentIdentity;
    correlationAttemptId: string;
    providerTestMode: boolean | null;
  }
  | {
    /** Non-actionable event (e.g. failed payment, overpaid) — safely ignored. */
    type: 'order.ignored';
  };

export interface PaymentAdapter {
  readonly provider: PaymentProvider;
  /**
   * Creates a hosted checkout session and returns a redirect URL.
   * All pricing must be passed in — provider must not be queried for prices.
   */
  createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSessionResult>;

  /**
   * Verifies the webhook request came from the trusted provider.
   * Receives the full headers map so each adapter can extract its own
   * signature header (providers use different header names).
   * Must use constant-time comparison to prevent timing attacks.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;

  /**
   * Parses the raw webhook body into a normalised PaymentWebhookEvent.
   * Called only after verifyWebhook returns true.
   */
  parseWebhookEvent(rawBody: string, headers: Record<string, string>): PaymentWebhookEvent;

  /**
   * Fetches authoritative payment facts over an authenticated provider channel.
   * Called only after verifyWebhook and only for a known stored identity.
   * Throws BadGatewayError when the provider is unreachable or answers
   * unusably — never returns a fabricated receipt.
   */
  retrieveReceipt(identity: PaymentIdentity): Promise<PaymentReceipt>;

  /**
   * The provider-side shop/project id this adapter is configured for, or null
   * when the provider has no such concept and authenticated retrieval is
   * already account-scoped by the API key.
   */
  expectedAccountId(): string | null;
}
