// ---------------------------------------------------------------------------
// Integration test per-worker setup.
// Loads .env.test so DATABASE_URL is available in each Vitest worker process.
// Does NOT mock prisma — integration tests use the real PrismaClient.
// ---------------------------------------------------------------------------

import { config } from 'dotenv'

config({ path: '.env.test' })

process.env.NODE_ENV = 'test'
process.env.FRONTEND_ORIGIN ??= 'http://localhost:3000'
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001'
process.env.BETTER_AUTH_SECRET ??= 'wave-atlas-integration-test-auth-secret-32-characters'
process.env.CLOUDINARY_CLOUD_NAME ??= process.env.VITE_CLOUDINARY_CLOUD_NAME ?? 'test-cloud'
process.env.CLOUDINARY_API_KEY ??= process.env.VITE_CLOUDINARY_API_KEY ?? 'test-cloudinary-key'
process.env.CLOUDINARY_API_SECRET ??= 'test-cloudinary-secret'
process.env.PAYMENT_PROVIDER ??= 'mock'
