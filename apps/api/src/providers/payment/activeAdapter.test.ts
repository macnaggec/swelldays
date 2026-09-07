import { describe, expect, it } from 'vitest';
import { apiConfig } from 'server/config/env';
import { cryptoCloudAdapter } from './CryptoCloudAdapter';
import { mockPaymentAdapter } from './MockPaymentAdapter';
import { paddleAdapter } from './PaddleAdapter';
import * as activeAdapter from './activeAdapter';

describe('active payment adapter selection', () => {
  it('exposes a guarded selector', () => {
    expect(activeAdapter).toHaveProperty('selectPaymentAdapter', expect.any(Function));
  });

  it('rejects live mock even when the decoder is bypassed', () => {
    expect(() => activeAdapter.selectPaymentAdapter({ commerceMode: 'live', payment: { provider: 'mock' } }))
      .toThrow(/mock/);
  });

  it('rejects live Paddle sandbox even when the decoder is bypassed', () => {
    expect(() => activeAdapter.selectPaymentAdapter({ commerceMode: 'live', payment: {
      provider: 'paddle', environment: 'sandbox', apiKey: 'fixture', webhookSecret: 'fixture',
    } })).toThrow(/sandbox/);
  });

  it('selects the concrete singleton for test mock and valid live providers', () => {
    expect(activeAdapter.selectPaymentAdapter({ commerceMode: 'test', payment: { provider: 'mock' } }))
      .toBe(mockPaymentAdapter);
    expect(activeAdapter.selectPaymentAdapter({ commerceMode: 'live', payment: {
      provider: 'paddle', environment: 'production', apiKey: 'pdl_live_apikey_fixture', webhookSecret: 'fixture',
    } })).toBe(paddleAdapter);
    expect(activeAdapter.selectPaymentAdapter({ commerceMode: 'live', payment: {
      provider: 'cryptocloud', apiKey: 'fixture', shopId: 'fixture', secretKey: 'fixture',
    } })).toBe(cryptoCloudAdapter);
  });

  it('uses the guarded selector for the exported active singleton', () => {
    expect(activeAdapter.paymentAdapter).toBe(activeAdapter.selectPaymentAdapter(apiConfig));
  });
});
