import { randomUUID } from 'node:crypto';
import type { PaymentIdentity } from 'server/domain/Payment';
import type { PaymentReceipt } from 'server/domain/PaymentReceipt';
import type {
  PaymentAdapter,
  CreateCheckoutParams,
  CheckoutSessionResult,
  PaymentWebhookEvent,
} from 'server/providers/payment/PaymentAdapter';

/**
 * MockPaymentAdapter — for local development only.
 *
 * createCheckoutSession reports immediate settlement to PaymentService, which
 * persists the provider identity before fulfilling and returning successUrl.
 * This skips the external payment page without exposing an unsigned HTTP route.
 *
 * Enable via PAYMENT_PROVIDER=mock in .env.
 */

// The mock has no real provider to ask, so retrieveReceipt recalls the last
// session it created in module scope instead. Acceptable for the mock only —
// every real adapter fetches its receipt from an authenticated provider call.
let lastCreatedSession: { totalCents: number; paymentAttemptId: string } | null = null;

async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CheckoutSessionResult> {
  lastCreatedSession = { totalCents: params.totalCents, paymentAttemptId: params.paymentAttemptId };
  return {
    providerTransactionId: `mock-${randomUUID()}`,
    environment: 'test',
    checkoutUrl: params.successUrl,
    expiresAt: null,
    settlement: 'completed',
    providerTestMode: null,
  };
}

function verifyWebhook(_rawBody: string, _headers: Record<string, string>): boolean {
  return true;
}

function parseWebhookEvent(_rawBody: string, _headers: Record<string, string>): PaymentWebhookEvent {
  return { type: 'order.ignored' };
}

async function retrieveReceipt(identity: PaymentIdentity): Promise<PaymentReceipt> {
  return {
    identity,
    status: 'paid',
    paidTotalCents: lastCreatedSession?.totalCents ?? 0,
    paidCurrency: 'USD',
    subtotalCents: null,
    taxCents: null,
    discountCents: null,
    settlementNetCents: null,
    providerAccountId: null,
    providerTestMode: true,
  };
}

function expectedAccountId(): string | null {
  return null;
}

export const mockPaymentAdapter: PaymentAdapter = {
  provider: 'mock',
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
  retrieveReceipt,
  expectedAccountId,
};
