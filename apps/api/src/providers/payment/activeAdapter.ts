// ---------------------------------------------------------------------------
// Active payment adapter — change PAYMENT_PROVIDER env var to swap providers.
// Everything else in the codebase imports from here, not from a concrete adapter.
// ---------------------------------------------------------------------------

import { cryptoCloudAdapter } from 'server/providers/payment/CryptoCloudAdapter';
import { mockPaymentAdapter } from 'server/providers/payment/MockPaymentAdapter';

export const paymentAdapter =
  process.env.PAYMENT_PROVIDER === 'mock' ? mockPaymentAdapter : cryptoCloudAdapter;
