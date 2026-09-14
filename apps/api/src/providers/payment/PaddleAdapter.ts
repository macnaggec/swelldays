import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadGatewayError, BadRequestError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { apiConfig } from 'server/config/env';
import type { PaymentIdentity } from 'server/domain/Payment';
import type { PaymentReceipt, ReceiptStatus } from 'server/domain/PaymentReceipt';
import type {
  PaymentAdapter,
  CreateCheckoutParams,
  CheckoutSessionResult,
  PaymentWebhookEvent,
} from 'server/providers/payment/PaymentAdapter';
import { PaymentCreationError } from 'server/providers/payment/PaymentAdapter';

// ---------------------------------------------------------------------------
// Paddle API types
// ---------------------------------------------------------------------------

interface PaddleTransactionResponse {
  data: {
    id: string;
    checkout: { url: string };
  };
}

interface PaddleTransactionRetrieveResponse {
  data: {
    id: string;
    status: string;
    currency_code: string;
    details: {
      totals: {
        subtotal?: string;
        discount?: string;
        tax?: string;
        total?: string;
        credit?: string;
        credit_to_balance?: string;
        balance?: string;
        grand_total: string;
        grand_total_tax?: string;
        fee?: string;
        earnings?: string;
        currency_code: string;
      };
      payout_totals?: {
        earnings?: string;
        exchange_rate?: string;
        fee_rate?: string;
        [key: string]: unknown;
      };
    };
  };
}

function isTransactionResponse(value: unknown): value is PaddleTransactionResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const transaction = data as Record<string, unknown>;
  const checkout = transaction.checkout;
  return typeof transaction.id === 'string'
    && typeof checkout === 'object'
    && checkout !== null
    && !Array.isArray(checkout)
    && typeof (checkout as Record<string, unknown>).url === 'string';
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
    custom_data: { paymentAttemptId: params.paymentAttemptId },
    checkout: { url: checkoutPageUrl },
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl()}/transactions`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new PaymentCreationError('unknown', 'provider-timeout', 'Payment provider timed out');
    }
    throw new PaymentCreationError('unknown', 'provider-unreachable', 'Payment provider is unreachable');
  }

  if (!response.ok) {
    logger.error('[Paddle] Transaction creation failed', { status: response.status });
    const ambiguous = response.status === 408
      || response.status === 409
      || response.status === 425
      || response.status === 429
      || response.status >= 500;
    const definitelyRejected = response.status >= 400 && response.status < 500 && !ambiguous;
    throw new PaymentCreationError(
      definitelyRejected ? 'definitively-failed' : 'unknown',
      definitelyRejected ? 'provider-rejected' : 'provider-unreachable',
      'Payment provider rejected transaction creation',
    );
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }
  if (!isTransactionResponse(decoded)) {
    logger.error('[Paddle] Unexpected transaction response');
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }
  const data = decoded;

  if (!data.data.id || !data.data.checkout.url) {
    logger.error('[Paddle] Unexpected transaction response');
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }

  return {
    providerTransactionId: data.data.id,
    environment: creds().environment,
    checkoutUrl: data.data.checkout.url,
    // Paddle transactions do not expose an authoritative expiry timestamp.
    // R05 owns any later provider-backed cancellation/lifetime policy.
    expiresAt: null,
    settlement: 'pending',
    providerTestMode: creds().environment === 'sandbox',
  };
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

/**
 * Accepts the signature when it matches ANY configured secret, so a rotation
 * can stage a new secret alongside the old one. Every secret is checked
 * regardless of an earlier match — returning as soon as one matches would
 * leak, via timing, which secret (old or new) produced the match.
 */
function verifyHmacSignature(signingInput: string, receivedSig: string): boolean {
  const { webhookSecrets } = creds();
  return webhookSecrets.reduce((matched, secret) => {
    const expectedSig = createHmac('sha256', secret)
      .update(signingInput)
      .digest('hex');
    let secretMatches: boolean;
    try {
      secretMatches = timingSafeEqual(Buffer.from(expectedSig), Buffer.from(receivedSig));
    } catch {
      secretMatches = false;
    }
    return matched || secretMatches;
  }, false);
}

function isTimestampStale(timestamp: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return true;
  return Math.abs(Math.floor(Date.now() / 1000) - ts) > SIGNATURE_TOLERANCE_SECONDS;
}

function isWebhookRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWebhookEvent(rawBody: string, _headers: Record<string, string>): PaymentWebhookEvent {
  let decoded: unknown;
  try { decoded = JSON.parse(rawBody); } catch { throw new BadRequestError('Malformed Paddle webhook'); }
  if (!isWebhookRecord(decoded)) {
    throw new BadRequestError('Malformed Paddle webhook');
  }
  const { event_id: eventId, event_type: eventType, occurred_at: occurredAtValue } = decoded;
  if (typeof eventId !== 'string' || typeof eventType !== 'string' || typeof occurredAtValue !== 'string') {
    throw new BadRequestError('Malformed Paddle webhook');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(occurredAtValue)) {
    throw new BadRequestError('Malformed Paddle webhook date');
  }
  const occurredAt = new Date(occurredAtValue);
  if (Number.isNaN(occurredAt.getTime())) throw new BadRequestError('Malformed Paddle webhook date');

  if (eventType !== 'transaction.completed') {
    logger.warn('[Paddle] Non-actionable webhook event — ignoring', { eventType });
    return { type: 'order.ignored', provider: 'paddle', sourceEventId: eventId, occurredAt, identity: null };
  }

  const data = decoded.data;
  if (!isWebhookRecord(data) || typeof data.id !== 'string' || !isWebhookRecord(data.custom_data)
    || typeof data.custom_data.paymentAttemptId !== 'string') {
    throw new BadRequestError('Malformed Paddle transaction webhook');
  }

  return {
    type: 'order.completed',
    provider: 'paddle',
    sourceEventId: eventId,
    occurredAt,
    identity: {
      provider: 'paddle',
      environment: creds().environment,
      providerTransactionId: data.id,
    },
    correlationAttemptId: data.custom_data.paymentAttemptId,
    providerTestMode: creds().environment === 'sandbox',
  };
}

function mapReceiptStatus(status: string): ReceiptStatus {
  switch (status) {
    case 'completed':
    case 'paid':
      return 'paid';
    case 'draft':
    case 'ready':
    case 'billed':
    case 'past_due':
      return 'unpaid';
    case 'canceled':
      return 'cancelled';
    default:
      logger.error('[Paddle] Unexpected transaction status in retrieveReceipt', { status });
      throw new BadGatewayError('Payment provider error');
  }
}

/**
 * Amounts on the transaction retrieval response are strings in the
 * currency's smallest unit. A field becomes null — never 0 — when it is
 * absent or does not parse to a finite number, so a missing breakdown field
 * can never be silently read as "zero".
 */
function parseMinorUnitAmount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetches the authoritative transaction facts for `identity` over Paddle's
 * authenticated transaction-retrieval endpoint. `grand_total` — not
 * `subtotal` or `total` — is what the customer was actually charged.
 */
async function retrieveReceipt(identity: PaymentIdentity): Promise<PaymentReceipt> {
  const { apiKey } = creds();

  const response = await fetch(
    `${baseUrl()}/transactions/${encodeURIComponent(identity.providerTransactionId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    logger.error('[Paddle] Transaction retrieval failed', { status: response.status });
    throw new BadGatewayError('Payment provider error');
  }

  const data = (await response.json()) as PaddleTransactionRetrieveResponse;

  if (data.data?.id !== identity.providerTransactionId) {
    logger.error('[Paddle] Transaction retrieval id mismatch', {
      providerTransactionId: identity.providerTransactionId,
    });
    throw new BadGatewayError('Payment provider error');
  }

  const totals = data.data.details.totals;
  const grandTotal = Number(totals.grand_total);
  if (!Number.isFinite(grandTotal)) {
    logger.error('[Paddle] Transaction retrieval grand_total is not a finite number', {
      providerTransactionId: identity.providerTransactionId,
    });
    throw new BadGatewayError('Payment provider error');
  }

  const payoutTotals = data.data.details.payout_totals;
  const payoutEarnings = parseMinorUnitAmount(payoutTotals?.earnings);
  const settlementNetCents = payoutTotals !== undefined && payoutEarnings !== null
    ? payoutEarnings
    : parseMinorUnitAmount(totals.earnings);

  return {
    identity,
    status: mapReceiptStatus(data.data.status),
    paidTotalCents: grandTotal,
    paidCurrency: totals.currency_code,
    subtotalCents: parseMinorUnitAmount(totals.subtotal),
    taxCents: parseMinorUnitAmount(totals.tax),
    discountCents: parseMinorUnitAmount(totals.discount),
    settlementNetCents,
    providerAccountId: null,
    providerTestMode: creds().environment === 'sandbox',
  };
}

// Paddle has no shop id and retrieval is already account-scoped by the API
// key, so there is nothing further to compare — returning a constant here
// would be a check that cannot fail.
function expectedAccountId(): string | null {
  return null;
}

export const paddleAdapter: PaymentAdapter = {
  provider: 'paddle',
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
  retrieveReceipt,
  expectedAccountId,
};
