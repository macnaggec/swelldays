// ---------------------------------------------------------------------------
// resetDb — truncates all tables in dependency order (children first).
//
// Call this in beforeEach of integration tests to guarantee a clean slate:
//
//   import { resetDb } from 'test/helpers/resetDb'
//   beforeEach(() => resetDb())
//
// Uses TRUNCATE ... CASCADE for safety, but the explicit order avoids
// relying on cascade for correctness — makes failures easier to diagnose.
// ---------------------------------------------------------------------------

import { prisma } from 'server/db'

export async function resetDb(): Promise<void> {
  await prisma.$transaction([
    // Leaf tables first (no FK dependents)
    prisma.payoutRequest.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.mediaItem.deleteMany(),
    prisma.surfSession.deleteMany(),
    prisma.spot.deleteMany(),
    // Auth tables
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.verification.deleteMany(),
    // Root
    prisma.user.deleteMany(),
  ])
}
