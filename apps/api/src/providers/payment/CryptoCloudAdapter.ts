import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadGatewayError } from 'server/errors';
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

// The vendor's documentation now shows `api.trybit.com`, but this legacy host
// is kept because R02 verified it responds and the creation call already uses
// it. R11 owns confirming the host against the configured integration before
// release.
const CRYPTOCLOUD_API_BASE = 'https://api.cryptocloud.plus';

// ---------------------------------------------------------------------------
// CryptoCloud API types
// ---------------------------------------------------------------------------

interface CCInvoiceResponse {
  status: 'success' | 'error';
  result?: {
    uuid: string;
    link: string;
    expiry_date: string;
    test_mode: boolean;
  };
}

interface CCWebhookPayload {
  status: string;          // 'success' | 'fail' | 'overpaid' | etc.
  invoice_id: string;      // documented short provider id, without INV-
  amount_crypto: number;
  currency: string;
  order_id: string | null; // our payment-attempt correlation id
  token: string | null;    // HS256 JWT signed with SECRET_KEY; null in some configurations
  invoice_info: {
    uuid: string;
    [key: string]: unknown;
  };
}

interface CCInvoiceInfoResponse {
  status: string;
  result?: unknown;
}

interface CCInvoiceInfoEntry {
  uuid: string;
  currency: string;
  project: { id: number | string; name: string };
  amount_usd: number;
  status: string;
  test_mode: boolean;
}

function isInvoiceResponse(value: unknown): value is CCInvoiceResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  if (response.status !== 'success' && response.status !== 'error') return false;
  return response.result === undefined
    || (typeof response.result === 'object' && response.result !== null && !Array.isArray(response.result));
}

function contentType(headers: Record<string, string>): string {
  return headers['content-type']?.split(';')[0]?.toLowerCase() ?? 'application/json';
}

/**
 * Decodes a JSON webhook body and checks its shape before it is trusted as a
 * CCWebhookPayload. Returns null — never throws — for malformed JSON or a
 * value that does not match the documented shape, so callers can treat an
 * untrustworthy body the same as any other non-actionable webhook.
 */
function parseJsonPayload(rawBody: string): CCWebhookPayload | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return null;
  const value = decoded as Record<string, unknown>;

  if (typeof value.status !== 'string' || typeof value.invoice_id !== 'string') return null;
  if (typeof value.token !== 'string' && value.token !== null) return null;
  if (typeof value.order_id !== 'string' && value.order_id !== null) return null;

  const invoiceInfo = value.invoice_info;
  if (typeof invoiceInfo !== 'object' || invoiceInfo === null || Array.isArray(invoiceInfo)) return null;
  if (typeof (invoiceInfo as Record<string, unknown>).uuid !== 'string') return null;

  return decoded as CCWebhookPayload;
}

function parseBody(rawBody: string, headers: Record<string, string>): CCWebhookPayload | null {
  if (contentType(headers) === 'application/x-www-form-urlencoded') {
    const form = new URLSearchParams(rawBody);
    return {
      status: form.get('status') ?? '',
      invoice_id: form.get('invoice_id') ?? '',
      amount_crypto: Number(form.get('amount_crypto')),
      currency: form.get('currency') ?? '',
      order_id: form.get('order_id'),
      token: form.get('token'),
      invoice_info: {
        uuid: normalizeInvoiceId(form.get('invoice_id') ?? ''),
        test_mode: form.get('test_mode') === null ? null : form.get('test_mode') === 'true',
      },
    };
  }
  return parseJsonPayload(rawBody);
}

function normalizeInvoiceId(providerId: string): string {
  return providerId.startsWith('INV-') ? providerId : `INV-${providerId}`;
}

function parseUtcExpiry(value: string): Date {
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimeZone ? value : `${value.replace(' ', 'T')}Z`);
}

// ---------------------------------------------------------------------------
// Credentials — read lazily on first use so importing this module does NOT
// throw when env vars are absent (e.g. when the mock adapter is selected).
// In production the first call to createCheckoutSession / verifyWebhook will
// throw immediately if any var is missing — still fail-fast, just not at
// import time.
// ---------------------------------------------------------------------------

function creds() {
  if (!apiConfig.cryptoCloud) {
    throw new Error('CryptoCloud credentials were not configured at startup');
  }
  return apiConfig.cryptoCloud;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

async function createCheckoutSession(
  params: CreateCheckoutParams
): Promise<CheckoutSessionResult> {
  const { apiKey, shopId } = creds();

  const body = {
    amount: params.totalCents / 100,
    shop_id: shopId,
    currency: 'USD',
    order_id: params.paymentAttemptId,
    success_url: params.successUrl,
    fail_url: params.failUrl,
  };

  let response: Response;
  try {
    response = await fetch(
      `${CRYPTOCLOUD_API_BASE}/v2/invoice/create`, {
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Token ${apiKey}`,
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
    logger.error('[CryptoCloud] Invoice creation failed', { status: response.status });
    const ambiguous = response.status === 408
      || response.status === 409
      || response.status === 425
      || response.status === 429
      || response.status >= 500;
    const definitelyRejected = response.status >= 400 && response.status < 500 && !ambiguous;
    throw new PaymentCreationError(
      definitelyRejected ? 'definitively-failed' : 'unknown',
      definitelyRejected ? 'provider-rejected' : 'provider-unreachable',
      'Payment provider rejected invoice creation',
    );
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch {
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }
  if (!isInvoiceResponse(decoded)) {
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }
  const data = decoded;

  if (
    data.status !== 'success'
    || typeof data.result?.link !== 'string'
    || data.result.link.length === 0
    || typeof data.result.uuid !== 'string'
    || data.result.uuid.length === 0
    || typeof data.result.expiry_date !== 'string'
    || typeof data.result.test_mode !== 'boolean'
  ) {
    logger.error('[CryptoCloud] Unexpected invoice response', { status: data.status });
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }

  const expiresAt = parseUtcExpiry(data.result.expiry_date);
  if (Number.isNaN(expiresAt.getTime())) {
    logger.error('[CryptoCloud] Invalid invoice expiry', { providerTransactionId: data.result.uuid });
    throw new PaymentCreationError('unknown', 'provider-response-invalid', 'Payment provider response was invalid');
  }
  return {
    providerTransactionId: data.result.uuid,
    environment: 'production',
    checkoutUrl: data.result.link,
    expiresAt,
    settlement: 'pending',
    providerTestMode: data.result.test_mode,
  };
}

/**
 * Verifies CryptoCloud webhook signature.
 *
 * CryptoCloud sends a HS256 JWT in the `token` field of the POST body.
 * The token is signed with the SECRET KEY from project settings.
 * Token is valid for 5 minutes after notification creation.
 *
 * We verify with HMAC-SHA256 directly to avoid a JWT library dependency:
 *   1. Split token into header.payload + signature parts
 *   2. Re-sign header.payload with SECRET_KEY using HS256
 *   3. Compare signatures (constant-time)
 *   4. Decode JWT payload and reject if exp claim is in the past
 */
function verifyWebhook(
  rawBody: string,
  _headers: Record<string, string>
): boolean {
  const body = parseBody(rawBody, _headers);
  if (body === null) return false;

  const token = body.token;
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [header, jwtPayload, receivedSig] = parts as [string, string, string];

  return (
    verifyHmacSignature(`${header}.${jwtPayload}`, receivedSig)
    && !isTokenExpired(jwtPayload)
  );
}

function verifyHmacSignature(
  signingInput: string,
  receivedSig: string
): boolean {
  const { secretKey } = creds();
  const expectedSig = createHmac('sha256', secretKey)
    .update(signingInput)
    .digest('base64url');
  try {
    return timingSafeEqual(
      Buffer.from(expectedSig),
      Buffer.from(receivedSig)
    );
  } catch {
    return false;
  }
}

/**
 * Returns true unless the JWT payload decodes to a present, finite, numeric
 * exp claim that has not yet passed. Fail-closed: a missing or non-numeric
 * exp is treated as expired rather than accepted.
 */
function isTokenExpired(jwtPayload: string): boolean {
  try {
    const decoded = JSON.parse(
      Buffer.from(jwtPayload, 'base64url').toString('utf8')
    ) as { exp?: unknown };

    return !(
      typeof decoded.exp === 'number'
      && Number.isFinite(decoded.exp)
      && decoded.exp >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return true; // fail-closed: undecodable payload treated as expired
  }
}

function parseWebhookEvent(
  rawBody: string,
  headers: Record<string, string>,
): PaymentWebhookEvent {
  const payload = parseBody(rawBody, headers);
  if (payload === null) return {
    type: 'order.ignored', provider: 'cryptocloud', sourceEventId: null, occurredAt: null, identity: null,
  };

  const normalizedTopLevelId = normalizeInvoiceId(payload.invoice_id);
  const identity: PaymentIdentity = {
    provider: 'cryptocloud', environment: 'production', providerTransactionId: normalizedTopLevelId,
  };

  if (payload.status !== 'success') {
    logger.warn('[CryptoCloud] Non-actionable webhook status — ignoring', { status: payload.status });
    return { type: 'order.ignored', provider: 'cryptocloud', sourceEventId: null, occurredAt: null, identity };
  }

  if (contentType(headers) !== 'application/x-www-form-urlencoded'
    && payload.invoice_info.uuid !== normalizedTopLevelId) {
    return { type: 'order.ignored', provider: 'cryptocloud', sourceEventId: null, occurredAt: null, identity };
  }

  return {
    type: 'order.completed',
    provider: 'cryptocloud',
    sourceEventId: null,
    occurredAt: null,
    identity: {
      provider: 'cryptocloud',
      environment: 'production',
      providerTransactionId: payload.invoice_info.uuid,
    },
    correlationAttemptId: payload.order_id ?? '',
    providerTestMode: typeof payload.invoice_info.test_mode === 'boolean'
      ? payload.invoice_info.test_mode
      : null,
  };
}

function mapReceiptStatus(status: string): ReceiptStatus {
  switch (status) {
    case 'paid':
      return 'paid';
    case 'overpaid':
      return 'overpaid';
    case 'created':
    case 'partial':
      return 'unpaid';
    case 'canceled':
      return 'cancelled';
    default:
      logger.error('[CryptoCloud] Unexpected invoice status in retrieveReceipt', { status });
      throw new BadGatewayError('Payment provider error');
  }
}

/**
 * Fetches the authoritative invoice facts for `identity` over CryptoCloud's
 * authenticated merchant-info endpoint. We always create USD invoices, so
 * `amount_usd` — not the crypto `amount` — is the fiat total to compare.
 */
async function retrieveReceipt(identity: PaymentIdentity): Promise<PaymentReceipt> {
  const { apiKey } = creds();

  const response = await fetch(`${CRYPTOCLOUD_API_BASE}/v2/invoice/merchant/info`, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uuids: [identity.providerTransactionId] }),
  });

  if (!response.ok) {
    logger.error('[CryptoCloud] Invoice retrieval failed', { status: response.status });
    throw new BadGatewayError('Payment provider error');
  }

  const data = (await response.json()) as CCInvoiceInfoResponse;

  if (data.status !== 'success' || !Array.isArray(data.result)) {
    logger.error('[CryptoCloud] Unexpected invoice retrieval response', { status: data.status });
    throw new BadGatewayError('Payment provider error');
  }

  const matches = (data.result as unknown[]).filter((entry) => (
    typeof entry === 'object' && entry !== null
    && (entry as { uuid?: unknown }).uuid === identity.providerTransactionId
  )) as CCInvoiceInfoEntry[];

  if (matches.length !== 1) {
    logger.error('[CryptoCloud] Invoice retrieval did not return exactly one matching entry', {
      providerTransactionId: identity.providerTransactionId,
      matchCount: matches.length,
    });
    throw new BadGatewayError('Payment provider error');
  }
  const entry = matches[0]!;

  if (typeof entry.amount_usd !== 'number' || !Number.isFinite(entry.amount_usd)) {
    logger.error('[CryptoCloud] Invoice retrieval amount_usd is not a finite number', {
      providerTransactionId: identity.providerTransactionId,
    });
    throw new BadGatewayError('Payment provider error');
  }

  return {
    identity,
    status: mapReceiptStatus(entry.status),
    paidTotalCents: Math.round(entry.amount_usd * 100),
    paidCurrency: 'USD',
    // A crypto invoice reports no fiat tax breakdown and no fiat settlement
    // net — do not derive one from the crypto `received`/`service_fee` fields.
    subtotalCents: null,
    taxCents: null,
    discountCents: null,
    settlementNetCents: null,
    providerAccountId: String(entry.project.id),
    providerTestMode: typeof entry.test_mode === 'boolean' ? entry.test_mode : null,
  };
}

function expectedAccountId(): string | null {
  return creds().shopId;
}

export const cryptoCloudAdapter: PaymentAdapter = {
  provider: 'cryptocloud',
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
  retrieveReceipt,
  expectedAccountId,
};
