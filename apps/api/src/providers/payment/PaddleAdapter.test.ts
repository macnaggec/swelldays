import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadGatewayError } from 'server/errors';
import { paddleAdapter } from './PaddleAdapter';

// ---------------------------------------------------------------------------
// Matches the safe configuration installed by the server test setup
// (apps/api/src/test/vitest.setup.ts).
// ---------------------------------------------------------------------------
const TEST_SECRET = 'unit-test-secret-key';

// ---------------------------------------------------------------------------
// Signature factory — mirrors exactly how Paddle signs its webhook: HMAC-SHA256
// hex digest of `${ts}:${rawBody}`, sent as `Paddle-Signature: ts=..;h1=..`.
// ---------------------------------------------------------------------------
function signatureHeader(rawBody: string, {
  ts = Math.floor(Date.now() / 1000),
  secret = TEST_SECRET,
  corrupt = false,
}: { ts?: number; secret?: string; corrupt?: boolean } = {}): string {
  const sig = corrupt
    ? 'deadbeef'.repeat(8)
    : createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return `ts=${ts};h1=${sig}`;
}

function makeWebhookBody(eventType = 'transaction.completed', overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event_id: 'evt_01',
    event_type: eventType,
    data: {
      id: 'txn_01m1v7datrz22kvtvp98mcvytk',
      custom_data: { paymentAttemptId: 'attempt-abc-123' },
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------
// verifyWebhook
// ---------------------------------------------------------------------------
describe('PaddleAdapter.verifyWebhook', () => {
  it('accepts a valid signature signed with the correct secret (happy path)', () => {
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody);
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(true);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { secret: 'wrong-secret' });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(false);
  });

  it('rejects a stale timestamp outside the tolerance window', () => {
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { ts: Math.floor(Date.now() / 1000) - 60 });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(false);
  });

  it('rejects a corrupted signature', () => {
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { corrupt: true });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(false);
  });

  it('rejects when the Paddle-Signature header is missing', () => {
    expect(paddleAdapter.verifyWebhook(makeWebhookBody(), {})).toBe(false);
  });

  it('rejects a header that is missing the ts or h1 part', () => {
    expect(paddleAdapter.verifyWebhook(makeWebhookBody(), { 'paddle-signature': 'ts=123' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseWebhookEvent
// ---------------------------------------------------------------------------
describe('PaddleAdapter.parseWebhookEvent', () => {
  it('returns a normalised order.completed event for a transaction.completed payload', () => {
    const rawBody = makeWebhookBody('transaction.completed');

    const event = paddleAdapter.parseWebhookEvent(rawBody, {});

    expect(event.type).toBe('order.completed');
    if (event.type !== 'order.completed') return;
    expect(event.identity).toEqual({
      provider: 'paddle',
      environment: 'sandbox',
      providerTransactionId: 'txn_01m1v7datrz22kvtvp98mcvytk',
    });
    expect(event.correlationAttemptId).toBe('attempt-abc-123');
  });

  it('returns order.ignored (not throws) for any other event type', () => {
    const rawBody = makeWebhookBody('transaction.payment_failed');

    const event = paddleAdapter.parseWebhookEvent(rawBody, {});

    expect(event.type).toBe('order.ignored');
  });
});

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------
describe('PaddleAdapter.createCheckoutSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const validParams = {
    paymentAttemptId: 'attempt-123',
    totalCents: 1500,
    successUrl: 'https://example.com/success',
    failUrl: 'https://example.com/fail',
  };

  it('returns the checkout URL from a successful transaction response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'txn_01',
          checkout: { url: 'https://example.com/checkout/paddle?_ptxn=txn_01' },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await paddleAdapter.createCheckoutSession(validParams);

    expect(result).toEqual({
      providerTransactionId: 'txn_01',
      environment: 'sandbox',
      checkoutUrl: 'https://example.com/checkout/paddle?_ptxn=txn_01',
      expiresAt: null,
      settlement: 'pending',
      providerTestMode: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox-api.paddle.com/transactions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-paddle-api-key' }),
      }),
    );

    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(requestBody.custom_data).toEqual({ paymentAttemptId: 'attempt-123' });
    expect(requestBody.items[0].price.unit_price).toEqual({ amount: '1500', currency_code: 'USD' });
    expect(requestBody.items[0].price.quantity).toEqual({ minimum: 1, maximum: 1 });
    expect(requestBody.checkout.url).toBe(
      'https://example.com/checkout/paddle'
      + '?successUrl=https%3A%2F%2Fexample.com%2Fsuccess'
      + '&failUrl=https%3A%2F%2Fexample.com%2Ffail',
    );
  });

  it('throws BadGatewayError when the API returns a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(
      paddleAdapter.createCheckoutSession(validParams)
    ).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError when the response has no checkout URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'txn_01' } }),
    }));

    await expect(
      paddleAdapter.createCheckoutSession(validParams)
    ).rejects.toBeInstanceOf(BadGatewayError);
  });
});
