import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { BadGatewayError } from 'server/errors';
import { cryptoCloudAdapter } from './CryptoCloudAdapter';

// ---------------------------------------------------------------------------
// Test secret — any string works for unit tests.
// We inject it via process.env so creds() inside the adapter can read it.
// ---------------------------------------------------------------------------
const TEST_SECRET = 'unit-test-secret-key';
const TEST_API_KEY = 'unit-test-api-key';
const TEST_SHOP_ID = 'unit-test-shop-id';

beforeAll(() => {
  process.env.CRYPTOCLOUD_SECRET_KEY = TEST_SECRET;
  process.env.CRYPTOCLOUD_API_KEY = TEST_API_KEY;
  process.env.CRYPTOCLOUD_SHOP_ID = TEST_SHOP_ID;
});

// ---------------------------------------------------------------------------
// JWT factory — mirrors exactly how CryptoCloud signs its webhook token.
// header.payload signed with HMAC-SHA256, all parts base64url encoded.
// ---------------------------------------------------------------------------
function makeJwt({
  exp = futureExp(),
  secret = TEST_SECRET,
  corruptSig = false,
}: {
  exp?: number;
  secret?: string;
  corruptSig?: boolean;
} = {}): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');

  const payload = Buffer.from(
    JSON.stringify({ exp })
  ).toString('base64url');

  const sig = corruptSig
    ? 'invalidsignatureXXXX'
    : createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest('base64url');

  return `${header}.${payload}.${sig}`;
}

function futureExp(offsetSeconds = 300): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

function pastExp(): number {
  return Math.floor(Date.now() / 1000) - 1;
}

// ---------------------------------------------------------------------------
// Webhook body factory — minimal valid CryptoCloud POST payload.
// ---------------------------------------------------------------------------
function makeWebhookBody(token: string | null, status = 'success'): string {
  return JSON.stringify({
    status,
    invoice_id: 'ILRAJE1Q',
    amount_crypto: 0.001,
    currency: 'BTC',
    order_id: 'order-abc-123',
    token,
    invoice_info: { uuid: 'invoice-uuid-001' },
  });
}

// ---------------------------------------------------------------------------
// verifyWebhook
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.verifyWebhook', () => {
  it('accepts a valid JWT signed with the correct secret (happy path)', () => {
    const rawBody = makeWebhookBody(makeJwt());
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(true);
  });

  it('rejects a JWT signed with the wrong secret', () => {
    const rawBody = makeWebhookBody(makeJwt({ secret: 'wrong-secret' }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects a JWT with an expired exp claim', () => {
    const rawBody = makeWebhookBody(makeJwt({ exp: pastExp() }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects a JWT with a corrupted signature', () => {
    const rawBody = makeWebhookBody(makeJwt({ corruptSig: true }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects when token field is null', () => {
    const rawBody = makeWebhookBody(null);
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects when JWT does not have exactly 3 parts', () => {
    const rawBody = makeWebhookBody('only.two');
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects malformed JSON body', () => {
    expect(cryptoCloudAdapter.verifyWebhook('{ not valid json ]', {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseWebhookEvent
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.parseWebhookEvent', () => {
  it('returns a normalised order.completed event for a success payload', () => {
    const rawBody = makeWebhookBody(makeJwt());

    const event = cryptoCloudAdapter.parseWebhookEvent(rawBody);

    expect(event.type).toBe('order.completed');
    if (event.type !== 'order.completed') return;
    expect(event.externalOrderId).toBe('ILRAJE1Q');
    expect(event.customData.orderId).toBe('order-abc-123');
  });

  it('returns order.ignored (not throws) for a non-success status payload', () => {
    const rawBody = makeWebhookBody(makeJwt(), 'fail');

    const event = cryptoCloudAdapter.parseWebhookEvent(rawBody);

    expect(event.type).toBe('order.ignored');
  });
});

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.createCheckoutSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const validParams = {
    orderId: 'order-123',
    itemIds: ['item-1'],
    totalCents: 1500,
    itemCount: 1,
    successUrl: 'https://example.com/success',
    failUrl: 'https://example.com/fail',
  };

  it('throws BadGatewayError when the API returns a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(
      cryptoCloudAdapter.createCheckoutSession(validParams)
    ).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError when the API returns a non-success response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', result: null }),
    }));

    await expect(
      cryptoCloudAdapter.createCheckoutSession(validParams)
    ).rejects.toBeInstanceOf(BadGatewayError);
  });
});
