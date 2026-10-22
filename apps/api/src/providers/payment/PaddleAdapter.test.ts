import { createHmac } from 'node:crypto';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { BadGatewayError } from 'server/errors';
import { PaymentCreationError } from './PaymentAdapter';
import { apiConfig } from 'server/config/env';
import { logger } from 'server/lib/logger';
import { paddleAdapter } from './PaddleAdapter';
import { BadRequestError } from 'server/errors';

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
    occurred_at: '2026-09-14T16:00:00Z',
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
// verifyWebhook — signature rotation (webhookSecrets accepts more than one)
// ---------------------------------------------------------------------------
describe('PaddleAdapter.verifyWebhook signature rotation', () => {
  const originalWebhookSecrets = apiConfig.paddle!.webhookSecrets;

  function setConfiguredSecrets(secrets: readonly string[]): void {
    (apiConfig.paddle as { webhookSecrets: readonly string[] }).webhookSecrets = secrets;
  }

  afterEach(() => {
    setConfiguredSecrets(originalWebhookSecrets);
  });

  it('accepts a signature made with the second (older) secret during rotation', () => {
    setConfiguredSecrets(['newest-secret', TEST_SECRET]);
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { secret: TEST_SECRET });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(true);
  });

  it('rejects a signature made with a secret that is not in the configured list', () => {
    setConfiguredSecrets(['newest-secret', TEST_SECRET]);
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { secret: 'totally-unknown-secret' });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(false);
  });

  it('still accepts a valid signature under a single-secret configuration', () => {
    setConfiguredSecrets([TEST_SECRET]);
    const rawBody = makeWebhookBody();
    const header = signatureHeader(rawBody, { secret: TEST_SECRET });
    expect(paddleAdapter.verifyWebhook(rawBody, { 'paddle-signature': header })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseWebhookEvent
// ---------------------------------------------------------------------------
describe('PaddleAdapter.parseWebhookEvent', () => {
  it('normalizes an approved refund adjustment using transaction identity', () => {
    const body = makeWebhookBody('adjustment.updated', {
      id: 'adj_01', transaction_id: 'txn_01', action: 'refund', status: 'approved',
      currency_code: 'usd', totals: { total: '250' }, updated_at: '2026-09-14T17:00:00Z',
    });
    expect(paddleAdapter.parseWebhookEvent(body, {})).toMatchObject({
      type: 'payment.adjustment', sourceEventId: 'evt_01',
      identity: { provider: 'paddle', providerTransactionId: 'txn_01' },
      adjustment: { providerAdjustmentId: 'adj_01', action: 'refund', status: 'approved',
        amountCents: 250, currency: 'USD' },
    });
  });

  it('rejects malformed adjustment financial facts', () => {
    const body = makeWebhookBody('adjustment.created', {
      id: 'adj_01', transaction_id: 'txn_01', action: 'refund', status: 'approved',
      currency_code: 'USD', totals: { total: '2.5' }, updated_at: 'not-a-date',
    });
    expect(() => paddleAdapter.parseWebhookEvent(body, {})).toThrow(BadRequestError);
  });

  it('rejects blank adjustment identity and malformed currency', () => {
    const body = makeWebhookBody('adjustment.created', {
      id: '', transaction_id: 'txn_01', action: 'refund', status: 'approved',
      currency_code: 'USDX', totals: { total: '250' }, updated_at: '2026-09-14T17:00:00Z',
    });
    expect(() => paddleAdapter.parseWebhookEvent(body, {})).toThrow(BadRequestError);
  });

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
    expect(event.sourceEventId).toBe('evt_01');
    expect(event.occurredAt).toEqual(new Date('2026-09-14T16:00:00Z'));
  });

  it('returns order.ignored (not throws) for any other event type', () => {
    const rawBody = makeWebhookBody('transaction.payment_failed');

    const event = paddleAdapter.parseWebhookEvent(rawBody, {});

    expect(event.type).toBe('order.ignored');
  });

  it('rejects missing event ids and invalid occurrence dates', () => {
    const missingId = JSON.parse(makeWebhookBody());
    delete missingId.event_id;
    expect(() => paddleAdapter.parseWebhookEvent(JSON.stringify(missingId), {})).toThrow(BadRequestError);
    const invalidDate = JSON.parse(makeWebhookBody());
    invalidDate.occurred_at = 'not-a-date';
    expect(() => paddleAdapter.parseWebhookEvent(JSON.stringify(invalidDate), {})).toThrow(BadRequestError);
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

  it('classifies an ambiguous 5xx response as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(
      paddleAdapter.createCheckoutSession(validParams)
    ).rejects.toMatchObject({ certainty: 'unknown', failureCode: 'provider-unreachable' });
  });

  it('logs safe Paddle error metadata when transaction creation is rejected', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'invalid_field',
          detail: 'Request does not pass validation.',
          errors: [{ field: 'checkout.url', message: 'must be on an approved domain' }],
        },
        meta: { request_id: 'request-123' },
      }),
    }));

    await expect(paddleAdapter.createCheckoutSession(validParams)).rejects.toBeInstanceOf(PaymentCreationError);

    expect(errorSpy).toHaveBeenCalledWith('[Paddle] Transaction creation failed', {
      status: 400,
      code: 'invalid_field',
      detail: 'Request does not pass validation.',
      validationErrors: [{ field: 'checkout.url', message: 'must be on an approved domain' }],
      requestId: 'request-123',
    });
  });

  it('classifies an unusable success response as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ data: { id: 'txn_01' } }),
    }));

    await expect(
      paddleAdapter.createCheckoutSession(validParams)
    ).rejects.toMatchObject({ certainty: 'unknown', failureCode: 'provider-response-invalid' });
  });

  it('classifies definite 4xx, timeout, transport, and malformed JSON creation failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(paddleAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'definitively-failed', failureCode: 'provider-rejected',
    });
    const timeout = new Error('timed out');
    timeout.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));
    await expect(paddleAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-timeout',
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(paddleAdapter.createCheckoutSession(validParams)).rejects.toBeInstanceOf(PaymentCreationError);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 201, json: async () => { throw new SyntaxError('bad json'); },
    }));
    await expect(paddleAdapter.createCheckoutSession(validParams)).rejects.toMatchObject({
      certainty: 'unknown', failureCode: 'provider-response-invalid',
    });
  });
});

describe('PaddleAdapter.updateCheckoutSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('replaces the aggregate checkout amount without changing attempt identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await paddleAdapter.updateCheckoutSession?.({
      identity: {
        provider: 'paddle',
        environment: 'sandbox',
        providerTransactionId: 'txn_01m2test',
      },
      paymentAttemptId: 'attempt-123',
      totalCents: 2300,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox-api.paddle.com/transactions/txn_01m2test',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(requestBody.custom_data).toEqual({ paymentAttemptId: 'attempt-123' });
    expect(requestBody.items[0].price.unit_price).toEqual({ amount: '2300', currency_code: 'USD' });
  });
});

// ---------------------------------------------------------------------------
// retrieveReceipt
// ---------------------------------------------------------------------------
describe('PaddleAdapter.retrieveReceipt', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const identity = {
    provider: 'paddle' as const,
    environment: 'sandbox' as const,
    providerTransactionId: 'txn_01m1v7datrz22kvtvp98mcvytk',
  };

  function makeTransactionResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      data: {
        id: identity.providerTransactionId,
        status: 'completed',
        currency_code: 'USD',
        details: {
          totals: {
            subtotal: '1200',
            discount: '0',
            tax: '300',
            total: '1500',
            credit: '0',
            credit_to_balance: '0',
            balance: '0',
            grand_total: '1500',
            grand_total_tax: '300',
            fee: '100',
            earnings: '1400',
            currency_code: 'USD',
          },
          payout_totals: {
            subtotal: '1200',
            discount: '0',
            tax: '300',
            total: '1500',
            credit: '0',
            credit_to_balance: '0',
            balance: '0',
            grand_total: '1500',
            grand_total_tax: '300',
            fee: '100',
            earnings: '1350',
            currency_code: 'USD',
            exchange_rate: '1',
            fee_rate: '0.05',
          },
        },
        ...overrides,
      },
    };
  }

  it('maps the documented response shape to the expected receipt, preferring payout_totals.earnings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(paddleAdapter.retrieveReceipt(identity)).resolves.toEqual({
      identity,
      status: 'paid',
      paidTotalCents: 1500,
      paidCurrency: 'USD',
      subtotalCents: 1200,
      taxCents: 300,
      discountCents: 0,
      settlementNetCents: 1350,
      providerAccountId: null,
      providerTestMode: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://sandbox-api.paddle.com/transactions/txn_01m1v7datrz22kvtvp98mcvytk',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-paddle-api-key' }),
      }),
    );
  });

  it('parses a grand_total string of "1000" as 1000 minor units', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({
        details: { totals: { grand_total: '1000', currency_code: 'USD' } },
      }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).resolves.toMatchObject({ paidTotalCents: 1000 });
  });

  it('leaves missing totals fields null, not 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({
        details: { totals: { grand_total: '1500', currency_code: 'USD' } },
      }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).resolves.toEqual({
      identity,
      status: 'paid',
      paidTotalCents: 1500,
      paidCurrency: 'USD',
      subtotalCents: null,
      taxCents: null,
      discountCents: null,
      settlementNetCents: null,
      providerAccountId: null,
      providerTestMode: true,
    });
  });

  it.each([
    ['completed', 'paid'],
    ['paid', 'paid'],
    ['draft', 'unpaid'],
    ['ready', 'unpaid'],
    ['billed', 'unpaid'],
    ['past_due', 'unpaid'],
    ['canceled', 'cancelled'],
  ] as const)('maps Paddle status %s to receipt status %s', async (paddleStatus, receiptStatus) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({ status: paddleStatus }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).resolves.toMatchObject({ status: receiptStatus });
  });

  it('throws BadGatewayError for an unrecognised status value', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({ status: 'unknown-status' }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws when the response id differs from the requested identity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({ id: 'txn_different' }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError for a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });

  it('throws BadGatewayError when grand_total does not parse to a finite number', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => makeTransactionResponse({
        details: { totals: { grand_total: 'not-a-number', currency_code: 'USD' } },
      }),
    }));

    await expect(paddleAdapter.retrieveReceipt(identity)).rejects.toBeInstanceOf(BadGatewayError);
  });
});

// ---------------------------------------------------------------------------
// expectedAccountId
// ---------------------------------------------------------------------------
describe('PaddleAdapter.expectedAccountId', () => {
  it('returns null — Paddle retrieval is already account-scoped by the API key', () => {
    expect(paddleAdapter.expectedAccountId()).toBeNull();
  });
});
