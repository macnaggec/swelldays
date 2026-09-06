// ---------------------------------------------------------------------------
// Active payment adapter — change PAYMENT_PROVIDER env var to swap providers.
// Everything else in the codebase imports from here, not from a concrete adapter.
// ---------------------------------------------------------------------------

import { cryptoCloudAdapter } from 'server/providers/payment/CryptoCloudAdapter';
import { mockPaymentAdapter } from 'server/providers/payment/MockPaymentAdapter';
import { paddleAdapter } from 'server/providers/payment/PaddleAdapter';
import { apiConfig } from 'server/config/env';

export const paymentAdapter =
  apiConfig.payment.provider === 'mock' ? mockPaymentAdapter
    : apiConfig.payment.provider === 'cryptocloud' ? cryptoCloudAdapter
      : paddleAdapter;
