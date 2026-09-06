import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadGatewayError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { apiConfig } from 'server/config/env';
import type {
  PaymentAdapter,
  CreateCheckoutParams,
  CheckoutSessionResult,
  PaymentWebhookEvent,
} from 'server/providers/payment/PaymentAdapter';

// ---------------------------------------------------------------------------
// Paddle API types
// ---------------------------------------------------------------------------

interface PaddleTransactionResponse {
  data: {
    id: string;
    checkout: { url: string };
  };
}

interface PaddleWebhookPayload {
  event_type: string;
  data: {
    id: string;             // txn_... — our externalOrderId
    custom_data: { orderId?: string } | null;
  };
}

// ---------------------------------------------------------------------------
// Credentials — read lazily on first use, same rationale as
// CryptoCloudAdapter: importing this module must not throw when the mock
// adapter is selected and Paddle env vars are absent.
// ---------------------------------------------------------------------------

function creds() {
  if (!apiConfig.paddle) {
    throw new Error('Paddle credentials were not configured at startup');
  }
  return apiConfig.paddle;
}

function baseUrl(): string {
  return creds().environment === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com';
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

/**
 * Unlike CryptoCloud's checkoutUrl (a page on CryptoCloud's own domain),
 * Paddle's overlay checkout runs on OUR domain — the `checkout.url` we send
 * is our own page, and Paddle appends `?_ptxn=<transactionId>` to it, which
 * that page's Paddle.js reads to open the overlay. successUrl/failUrl are
 * round-tripped through this page's own query string: Paddle only accepts
 * one successUrl at transaction-creation time, and we still need failUrl for
 * when the buyer closes the overlay without paying (verified empirically
 * against the Sandbox API — see docs/roadmaps for the confirmed request/
 * response shape).
 */
async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CheckoutSessionResult> {
  const { apiKey } = creds();

  const origin = new URL(params.successUrl).origin;
  const checkoutPageUrl = `${origin}/checkout/paddle`
    + `?successUrl=${encodeURIComponent(params.successUrl)}`
    + `&failUrl=${encodeURIComponent(params.failUrl)}`;

  const body = {
    items: [
      {
        quantity: 1,
        price: {
          description: 'Swelldays order',
          name: 'Swelldays order',
          unit_price: {
            amount: String(params.totalCents),
            currency_code: 'USD',
          },
          product: {
            name: 'Swelldays order',
            tax_category: 'standard',
          },
          // Locks the quantity stepper in Paddle's checkout UI to exactly 1.
          // totalCents already reflects the buyer's whole cart — a buyer
          // bumping this to 2 would be charged double by Paddle while our
          // fulfillment still only delivers the one order's fixed item set
          // (see OrderRepository.findOrderById), since Paddle has no concept
          // of what a "unit" of this line item corresponds to on our side.
          quantity: { minimum: 1, maximum: 1 },
        },
      },
    ],
    custom_data: { orderId: params.orderId },
    checkout: { url: checkoutPageUrl },
  };

  const response = await fetch(`${baseUrl()}/transactions`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('[Paddle] Transaction creation failed', { status: response.status, body: text });
    throw new BadGatewayError('Payment provider error');
  }

  const data = (await response.json()) as PaddleTransactionResponse;

  if (!data.data?.checkout?.url) {
    logger.error('[Paddle] Unexpected transaction response', { data });
    throw new BadGatewayError('Payment provider error');
  }

  return { checkoutUrl: data.data.checkout.url };
}

const SIGNATURE_TOLERANCE_SECONDS = 5;

/**
 * Verifies Paddle's webhook signature.
 *
 * Paddle sends `Paddle-Signature: ts=<unix_seconds>;h1=<hex_hmac>`. We
 * re-sign `${ts}:${rawBody}` with the notification destination's secret key
 * (HMAC-SHA256, hex) and compare in constant time, then reject stale
 * timestamps. 5 seconds is Paddle's own documented default tolerance
 * (https://developer.paddle.com/webhooks/about/signature-verification/) —
 * tight for real network delivery, but this is their stated guidance, not a
 * value invented here; revisit if legitimate webhooks start getting
 * rejected as stale in the logs.
 */
function verifyWebhook(
  rawBody: string,
  headers: Record<string, string>,
): boolean {
  const header = headers['paddle-signature'];
  if (!header) return false;

  const parts = Object.fromEntries(
    header.split(';').map((part) => part.split('=') as [string, string]),
  );
  const timestamp = parts.ts;
  const signature = parts.h1;
  if (!timestamp || !signature) return false;

  return (
    verifyHmacSignature(`${timestamp}:${rawBody}`, signature)
    && !isTimestampStale(timestamp)
  );
}

function verifyHmacSignature(signingInput: string, receivedSig: string): boolean {
  const { webhookSecret } = creds();
  const expectedSig = createHmac('sha256', webhookSecret)
    .update(signingInput)
    .digest('hex');
  try {
    return timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig));
  } catch {
    return false;
  }
}

function isTimestampStale(timestamp: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return true;
  return Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_TOLERANCE_SECONDS;
}

function parseWebhookEvent(rawBody: string): PaymentWebhookEvent {
  const payload = JSON.parse(rawBody) as PaddleWebhookPayload;

  if (payload.event_type !== 'transaction.completed') {
    logger.warn('[Paddle] Non-actionable webhook event — ignoring', { eventType: payload.event_type });
    return { type: 'order.ignored' };
  }

  return {
    type: 'order.completed',
    externalOrderId: payload.data.id,
    customData: {
      orderId: payload.data.custom_data?.orderId ?? '',
    },
  };
}

export const paddleAdapter: PaymentAdapter = {
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
};
