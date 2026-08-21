import { logger } from 'server/lib/logger';
import type {
  PaymentAdapter,
  CreateCheckoutParams,
  CheckoutSessionResult,
  PaymentWebhookEvent,
} from 'server/providers/payment/PaymentAdapter';

interface MockWebhookBody {
  orderId: string;
  externalOrderId: string;
}

/**
 * MockPaymentAdapter — for local development only.
 *
 * createCheckoutSession fires the webhook to the local server synchronously
 * (so the purchase exists in DB before the browser lands on the success page),
 * then returns successUrl directly — skipping the CryptoCloud payment page entirely.
 *
 * Enable via PAYMENT_PROVIDER=mock in .env.
 */
async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CheckoutSessionResult> {
  const body: MockWebhookBody = {
    orderId: params.orderId,
    externalOrderId: `mock-${Date.now()}`,
  };

  try {
    const res = await fetch('http://localhost:3001/api/webhook/cryptocloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      logger.warn('[MockAdapter] Self-webhook returned non-ok', { status: res.status });
    }
  } catch (err) {
    logger.error('[MockAdapter] Self-webhook failed', { err });
  }

  return { checkoutUrl: params.successUrl };
}

function verifyWebhook(_rawBody: string, _headers: Record<string, string>): boolean {
  return true;
}

function parseWebhookEvent(rawBody: string): PaymentWebhookEvent {
  try {
    const body = JSON.parse(rawBody) as MockWebhookBody;
    if (body.orderId && body.externalOrderId) {
      return {
        type: 'order.completed',
        externalOrderId: body.externalOrderId,
        customData: {
          orderId: body.orderId,
        },
      };
    }
  } catch {
    // fall through
  }

  return { type: 'order.ignored' };
}

export const mockPaymentAdapter: PaymentAdapter = {
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
};
