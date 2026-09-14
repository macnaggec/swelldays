import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadGatewayError } from 'server/errors';
import { PaymentCreationError } from './PaymentAdapter';
import { cryptoCloudAdapter } from './CryptoCloudAdapter';
import { toStoredPaymentEvent } from 'server/domain/PaymentNotification';

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

// ---------------------------------------------------------------------------
// JWT factory with an arbitrary payload — used to test malformed/missing exp
// claims while still producing a correctly signed token.
// ---------------------------------------------------------------------------
function makeJwtWithPayload(payload: Record<string, unknown>, secret = TEST_SECRET): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  ).toString('base64url');

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sig = createHmac('sha256', secret)
    .update(`${header}.${encodedPayload}`)
    .digest('base64url');

  return `${header}.${encodedPayload}.${sig}`;
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

  it('rejects a JWT whose payload omits exp', () => {
    const rawBody = makeWebhookBody(makeJwtWithPayload({}));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects a JWT whose exp is a numeric string', () => {
    const rawBody = makeWebhookBody(makeJwtWithPayload({ exp: '9999999999' }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('rejects a JWT whose exp is null', () => {
    const rawBody = makeWebhookBody(makeJwtWithPayload({ exp: null }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(false);
  });

  it('accepts a JWT with a valid future numeric exp', () => {
    const rawBody = makeWebhookBody(makeJwt({ exp: futureExp() }));
    expect(cryptoCloudAdapter.verifyWebhook(rawBody, {})).toBe(true);
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

  it('deduplicates regenerated JWT and form/JSON delivery by normalized invoice facts', () => {
    const jsonEvent = cryptoCloudAdapter.parseWebhookEvent(
      makeWebhookBody(makeJwt()), { 'content-type': 'application/json' },
    );
    const formEvent = cryptoCloudAdapter.parseWebhookEvent(
      'status=success&invoice_id=89UX09KA&order_id=order-abc-123&token=a.different.jwt&test_mode=false',
      { 'content-type': 'application/x-www-form-urlencoded' },
    );
    expect(toStoredPaymentEvent(jsonEvent).eventKey).toBe(toStoredPaymentEvent(formEvent).eventKey);
  });

  it('rejects disagreement between the JSON invoice ids', () => {
    const payload = JSON.parse(makeWebhookBody(makeJwt()));
    payload.invoice_info.uuid = 'INV-DIFFERENT';
    expect(cryptoCloudAdapter.parseWebhookEvent(
      JSON.stringify(payload),
      { 'content-type': 'application/json' },
    )).toEqual(expect.objectContaining({ type: 'order.ignored', provider: 'cryptocloud' }));
  });

  it('ignores (not throws) a body whose invoice_info is a string', () => {
    const payload = JSON.parse(makeWebhookBody(makeJwt()));
    payload.invoice_info = 'not-an-object';
    expect(cryptoCloudAdapter.parseWebhookEvent(
      JSON.stringify(payload),
      { 'content-type': 'application/json' },
    )).toEqual(expect.objectContaining({ type: 'order.ignored', provider: 'cryptocloud' }));
  });

  it('ignores a body that is a bare JSON array', () => {
    expect(cryptoCloudAdapter.parseWebhookEvent(
      '[1,2,3]',
      { 'content-type': 'application/json' },
    )).toEqual(expect.objectContaining({ type: 'order.ignored', provider: 'cryptocloud' }));
  });

  it('ignores a body whose status is a number', () => {
    const payload = JSON.parse(makeWebhookBody(makeJwt()));
    payload.status = 200;
    expect(cryptoCloudAdapter.parseWebhookEvent(
      JSON.stringify(payload),
      { 'content-type': 'application/json' },
    )).toEqual(expect.objectContaining({ type: 'order.ignored', provider: 'cryptocloud' }));
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
      provider: 'cryptocloud',
      sourceEventId: null,
      occurredAt: null,
      identity: {
        provider: 'cryptocloud',
        environment: 'production',
        providerTransactionId: 'INV-89UX09KA',
      },
      correlationAttemptId: 'attempt-123',
      providerTestMode: true,
    });
  });

  it('classifies an ambiguous 5xx response as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(
      cryptoCloudAdapter.createCheckoutSession(validParams)
    ).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-unreachable',
    });
  });

  it('classifies an unusable success response as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', result: null }),
    }));

    await expect(
      cryptoCloudAdapter.createCheckoutSession(validParams)
    ).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-response-invalid',
    });
  });

  it('classifies a definite 4xx rejection and timeout separately', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'definitively-failed', failureCode: 'provider-rejected',
    });

    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-timeout',
    });
  });

  it('classifies transport and malformed JSON failures conservatively', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection reset')));
    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).rejects.toBeInstanceOf(PaymentCreationError);
    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-unreachable',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); },
    }));
    await expect(cryptoCloudAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-response-invalid',
    });
  });
});

// ---------------------------------------------------------------------------
// retrieveReceipt
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.retrieveReceipt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const identity = {
    provider: 'cryptocloud' as const,
    environment: 'production' as const,
    providerTransactionId: 'INV-89UX09KA',
  };

  function makeMerchantInfoEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      uuid: 'INV-89UX09KA',
      created: '2026-09-07T18:00:00Z',
      address: 'bc1qexample',
      currency: 'BTC',
      project: { id: 42, name: 'Swelldays' },
      amount: 0.001,
      amount_usd: 15,
      amount_in_fiat: 15,
      amount_to_pay: 0.001,
      amount_paid: 0.001,
      fee: 0,
      service_fee: 0,
      received: 0.001,
      to_surcharge: 0,
      status: 'paid',
      test_mode: true,
      ...overrides,
    };
  }

  it('maps a documented success response to the expected receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result: [makeMerchantInfoEntry()] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).resolves.toEqual({
      identity,
      status: 'paid',
      paidTotalCents: 1500,
      paidCurrency: 'USD',
      subtotalCents: null,
      taxCents: null,
      discountCents: null,
      settlementNetCents: null,
      providerAccountId: '42',
      providerTestMode: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cryptocloud.plus/v2/invoice/merchant/info',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Token test-cryptocloud-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(requestBody).toEqual({ uuids: ['INV-89UX09KA'] });
  });

  it.each([
    ['paid', 'paid'],
    ['overpaid', 'overpaid'],
    ['created', 'unpaid'],
    ['partial', 'unpaid'],
    ['canceled', 'cancelled'],
  ] as const)('maps CryptoCloud status %s to receipt status %s', async (ccStatus, receiptStatus) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result: [makeMerchantInfoEntry({ status: ccStatus })] }),
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).resolves.toMatchObject({
      status: receiptStatus,
    });
  });

  it('throws BadGatewayError for an unrecognised status value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result: [makeMerchantInfoEntry({ status: 'unknown-status' })] }),
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws when the result entry uuid differs from the requested identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result: [makeMerchantInfoEntry({ uuid: 'INV-DIFFERENT' })] }),
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError for a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError when status is error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'error', result: [] }),
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError when amount_usd is not a finite number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', result: [makeMerchantInfoEntry({ amount_usd: 'fifteen' })] }),
    }));

    await expect(cryptoCloudAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });
});

// ---------------------------------------------------------------------------
// expectedAccountId
// ---------------------------------------------------------------------------
describe('CryptoCloudAdapter.expectedAccountId', () => {
  it('returns the configured shop id', () => {
    expect(cryptoCloudAdapter.expectedAccountId()).toBe('test-cryptocloud-shop-id');
  });
});
