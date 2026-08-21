import type { MockedFunction } from 'vitest'
import type { PaymentAdapter } from 'server/providers/payment/PaymentAdapter'
import { paymentAdapter } from 'server/providers/payment/activeAdapter'

// Export a typed mock of the payment adapter.
// Safe because the module is mocked globally in vitest.setup.ts.
export const paymentAdapterMock = paymentAdapter as {
  createCheckoutSession: MockedFunction<PaymentAdapter['createCheckoutSession']>
  verifyWebhook: MockedFunction<PaymentAdapter['verifyWebhook']>
  parseWebhookEvent: MockedFunction<PaymentAdapter['parseWebhookEvent']>
}
