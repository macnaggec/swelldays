import { randomUUID } from 'node:crypto';
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
async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CheckoutSessionResult> {
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

export const mockPaymentAdapter: PaymentAdapter = {
  provider: 'mock',
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
};
