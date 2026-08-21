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
// CryptoCloud API types
// ---------------------------------------------------------------------------

interface CCInvoiceResponse {
  status: 'success' | 'error';
  result?: {
    uuid: string;
    link: string;
  };
}

interface CCWebhookPayload {
  status: string;          // 'success' | 'fail' | 'overpaid' | etc.
  invoice_id: string;      // e.g. "ILRAJE1Q" — our externalOrderId
  amount_crypto: number;
  currency: string;
  order_id: string | null; // our orderId (from add_fields.order_id at creation)
  token: string | null;    // HS256 JWT signed with SECRET_KEY; null in some configurations
  invoice_info: {
    uuid: string;
    [key: string]: unknown;
  };
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
    add_fields: {
      order_id: params.orderId,
    },
    success_url: params.successUrl,
    fail_url: params.failUrl,
  };

  const response = await fetch(
    'https://api.cryptocloud.plus/v2/invoice/create', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error('[CryptoCloud] Invoice creation failed', { status: response.status, body: text });
    throw new BadGatewayError('Payment provider error');
  }

  const data = (await response.json()) as CCInvoiceResponse;

  if (data.status !== 'success' || !data.result?.link) {
    logger.error('[CryptoCloud] Unexpected invoice response', { data });
    throw new BadGatewayError('Payment provider error');
  }

  return { checkoutUrl: data.result.link };
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
  let body: CCWebhookPayload;

  try {
    body = JSON.parse(rawBody) as CCWebhookPayload;
  } catch {
    return false;
  }

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

/** Returns true if the JWT payload cannot be decoded or its exp claim is in the past. */
function isTokenExpired(jwtPayload: string): boolean {
  try {
    const decoded = JSON.parse(
      Buffer.from(jwtPayload, 'base64url').toString('utf8')
    ) as { exp?: number };

    return (
      typeof decoded.exp === 'number'
      && decoded.exp < Math.floor(Date.now() / 1000)
    );
  } catch {
    return true; // fail-closed: undecodable payload treated as expired
  }
}

function parseWebhookEvent(rawBody: string): PaymentWebhookEvent {
  const payload = JSON.parse(rawBody) as CCWebhookPayload;

  if (payload.status !== 'success') {
    logger.warn('[CryptoCloud] Non-actionable webhook status — ignoring', { status: payload.status });
    return { type: 'order.ignored' };
  }

  return {
    type: 'order.completed',
    // invoice_id is the short CryptoCloud invoice ID (e.g. "ILRAJE1Q")
    externalOrderId: payload.invoice_id,
    customData: {
      // order_id is our Swelldays orderId passed via add_fields at creation
      orderId: payload.order_id ?? '',
    },
  };
}

export const cryptoCloudAdapter: PaymentAdapter = {
  createCheckoutSession,
  verifyWebhook,
  parseWebhookEvent,
};
