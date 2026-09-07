// ---------------------------------------------------------------------------
// Active payment adapter — change PAYMENT_PROVIDER env var to swap providers.
// Everything else in the codebase imports from here, not from a concrete adapter.
// ---------------------------------------------------------------------------

import { cryptoCloudAdapter } from 'server/providers/payment/CryptoCloudAdapter';
import { mockPaymentAdapter } from 'server/providers/payment/MockPaymentAdapter';
import { paddleAdapter } from 'server/providers/payment/PaddleAdapter';
import type { ApiConfig } from 'server/config/decodeApiEnvironment';
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter';
import { apiConfig } from 'server/config/env';

export function selectPaymentAdapter(config: Pick<ApiConfig, 'commerceMode' | 'payment'>): PaymentAdapter {
  if (config.commerceMode === 'live') {
    if (config.payment.provider === 'mock') {
      throw new Error('PAYMENT_PROVIDER cannot be mock when COMMERCE_MODE is live');
    }
    if (config.payment.provider === 'paddle' && config.payment.environment === 'sandbox') {
      throw new Error('PADDLE_ENVIRONMENT cannot be sandbox when COMMERCE_MODE is live');
    }
  }
  return config.payment.provider === 'mock' ? mockPaymentAdapter
    : config.payment.provider === 'cryptocloud' ? cryptoCloudAdapter
      : paddleAdapter;
}

export const paymentAdapter: PaymentAdapter = selectPaymentAdapter(apiConfig);
