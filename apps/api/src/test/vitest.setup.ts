import { vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5433/swelldays_test'
process.env.FRONTEND_ORIGIN ??= 'http://localhost:3000'
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001'
process.env.BETTER_AUTH_SECRET ??= 'swelldays-unit-test-auth-secret-32-characters'
process.env.GOOGLE_CLIENT_ID ??= 'test-client.apps.googleusercontent.com'
process.env.GOOGLE_CLIENT_SECRET ??= 'test-google-client-secret'
process.env.CLOUDINARY_CLOUD_NAME ??= 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= 'test-cloudinary-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-cloudinary-secret'
process.env.PAYMENT_PROVIDER ??= 'mock'
process.env.CRYPTOCLOUD_API_KEY ??= 'test-cryptocloud-api-key'
process.env.CRYPTOCLOUD_SHOP_ID ??= 'test-cryptocloud-shop-id'
process.env.CRYPTOCLOUD_SECRET_KEY ??= 'unit-test-secret-key'

// ---------------------------------------------------------------------------
// Server module mocks — applied globally to every server test so individual
// test files don't need their own vi.mock() boilerplate.
// Typed accessors, when needed, live with their owning application tests.
// ---------------------------------------------------------------------------

vi.mock('server/db', () => ({
  prisma: mockDeep(),
}))

vi.mock('server/lib/payment/activeAdapter', () => ({
  paymentAdapter: {
    createCheckoutSession: vi.fn(),
    verifyWebhook: vi.fn(),
    parseWebhookEvent: vi.fn(),
  },
}))
