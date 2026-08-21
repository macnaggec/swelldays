import { vi } from 'vitest'
import { mockDeep } from 'vitest-mock-extended'
import '@testing-library/jest-dom/vitest'

// ---------------------------------------------------------------------------
// Server module mocks — prevent accidental real DB / payment calls from
// any client test that imports server code indirectly.
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

// ---------------------------------------------------------------------------
// Browser API polyfills required by Mantine and React Testing Library.
// ---------------------------------------------------------------------------

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

global.ResizeObserver = ResizeObserverMock

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
