import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadGatewayError } from 'server/errors';
import { cryptoCloudAdapter } from './CryptoCloudAdapter';

// ---------------------------------------------------------------------------
// These values match the safe configuration installed by the server test setup.
// ---------------------------------------------------------------------------
const TEST_SECRET = 'unit-test-secret-key';

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
    invoice_id: '89UX09KA',
    amount_crypto: 0.001,
    currency: 'BTC',
    order_id: 'order-abc-123',
    token,
    invoice_info: { uuid: 'INV-89UX09KA', test_mode: false },
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

  it('accepts a valid token in a form-encoded callback', () => {
    const form = new URLSearchParams({
      status: 'success',
      invoice_id: '89UX09KA',
      order_id: 'attempt-123',
      token: makeJwt(),
    });
    expect(cryptoCloudAdapter.verifyWebhook(form.toString(), {
      'content-type': 'application/x-www-form-urlencoded',
    })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseWebhookEvent
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.parseWebhookEvent', () => {
  it('returns a normalised order.completed event for a success payload', () => {
    const rawBody = makeWebhookBody(makeJwt());

    const event = cryptoCloudAdapter.parseWebhookEvent(rawBody, { 'content-type': 'application/json' });

    expect(event.type).toBe('order.completed');
    if (event.type !== 'order.completed') return;
    expect(event.identity).toEqual({
      provider: 'cryptocloud',
      environment: 'production',
      providerTransactionId: 'INV-89UX09KA',
    });
    expect(event.correlationAttemptId).toBe('order-abc-123');
    expect(event.providerTestMode).toBe(false);
  });

  it('returns order.ignored (not throws) for a non-success status payload', () => {
    const rawBody = makeWebhookBody(makeJwt(), 'fail');

    const event = cryptoCloudAdapter.parseWebhookEvent(rawBody, { 'content-type': 'application/json' });

    expect(event.type).toBe('order.ignored');
  });

  it('rejects disagreement between the JSON invoice ids', () => {
    const payload = JSON.parse(makeWebhookBody(makeJwt()));
    payload.invoice_info.uuid = 'INV-DIFFERENT';
    expect(cryptoCloudAdapter.parseWebhookEvent(
      JSON.stringify(payload),
      { 'content-type': 'application/json' },
    )).toEqual({ type: 'order.ignored' });
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
    paymentAttemptId: 'attempt-123',
    totalCents: 1500,
    successUrl: 'https://example.com/success',
    failUrl: 'https://example.com/fail',
  };

  it('persists the documented transaction identity, expiry, and test mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        result: {
          uuid: 'INV-89UX09KA',
          link: 'https://pay.cryptocloud.plus/fixture',
          expiry_date: '2026-09-07 18:00:00',
          test_mode: true,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).resolves.toEqual({
      providerTransactionId: 'INV-89UX09KA',
      environment: 'production',
      checkoutUrl: 'https://pay.cryptocloud.plus/fixture',
      expiresAt: new Date('2026-09-07T18:00:00Z'),
      settlement: 'pending',
      providerTestMode: true,
    });
    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(requestBody.order_id).toBe('attempt-123');
    expect(requestBody).not.toHaveProperty('add_fields');
  });

  it('parses documented form callbacks and normalizes the short invoice id', () => {
    const event = cryptoCloudAdapter.parseWebhookEvent(
      'status=success&invoice_id=89UX09KA&order_id=attempt-123&test_mode=true',
      { 'content-type': 'application/x-www-form-urlencoded' },
    );
    expect(event).toEqual({
      type: 'order.completed',
      identity: {
        provider: 'cryptocloud',
        environment: 'production',
        providerTransactionId: 'INV-89UX09KA',
      },
      correlationAttemptId: 'attempt-123',
      providerTestMode: true,
    });
  });

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
