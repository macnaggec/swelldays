// ---------------------------------------------------------------------------
// Integration test global setup — runs ONCE in the main process before any
// test workers start. Safe to use Node APIs and spawn child processes.
//
// Responsibility: ensure the test DB schema is up to date.
// The test DB itself must already be running (docker compose up).
// ---------------------------------------------------------------------------

import { execSync } from 'node:child_process'
import { config } from 'dotenv'

export default function setup() {
  // Load .env.test so DATABASE_URL points at the test DB for this process
  // and all child processes spawned from here (e.g. prisma migrate deploy).
  config({ path: '.env.test' })

  console.log('[integration] Running prisma migrate deploy on test DB...')
  execSync('npm run prisma:migrate:deploy --workspace @wave-atlas/api', {
    stdio: 'inherit',
    env: { ...process.env },
  })
  console.log('[integration] Migrations applied.')
}
