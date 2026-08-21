// ---------------------------------------------------------------------------
// Integration test per-worker setup.
// Loads .env.test so DATABASE_URL is available in each Vitest worker process.
// Does NOT mock prisma — integration tests use the real PrismaClient.
// ---------------------------------------------------------------------------

import { config } from 'dotenv'

config({ path: '.env.test' })
