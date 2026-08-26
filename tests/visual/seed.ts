/**
 * Capture-database seed for the visual-regression matrix (roadmap F12h).
 *
 * This is the single owner of the data every captured state renders. It runs
 * against a dedicated capture database — never the mutable dev database —
 * because a baseline that depends on records the user edits while working would
 * rot on its own and report layout regressions that never happened.
 *
 * Run via `npm run capture:seed`, which resets the schema first, so the result
 * is the same set of rows on every invocation.
 *
 * The account is created through better-auth's own server API rather than by
 * writing a password hash directly: the hash format is better-auth's business,
 * and the Playwright setup project has to be able to sign in with these
 * credentials over the real endpoint.
 */

import { PayoutStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { prisma } from 'server/db';
import { auth } from 'server/auth';
import {
  CAPTURE_DATES,
  CAPTURE_IDS,
  CAPTURE_MEDIA_COUNT,
  readCaptureCredentials,
} from './fixtures';

const CLOUD_NAME = process.env.VITE_CLOUDINARY_CLOUD_NAME ?? 'capture-cloud';

/** The only database this seed is ever allowed to truncate. */
const CAPTURE_DATABASE = 'surfdb_capture';

/**
 * Refuse to run against anything but the capture database. This script empties
 * every table, so pointing it at the dev database by loading the wrong env file
 * would destroy real work — a guard is cheaper than the accident.
 */
function assertCaptureDatabase(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Run via `npm run capture:seed`.');
  if (!url.includes(CAPTURE_DATABASE)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL does not point at ${CAPTURE_DATABASE}. `
        + 'This script truncates every table and must only ever run against the capture database.',
    );
  }
}

/**
 * Empty every table so a re-run produces identical rows. Discovered from the
 * catalog rather than listed by hand, so adding a Prisma model cannot silently
 * leave stale rows behind and rot a baseline. `_prisma_migrations` is preserved:
 * dropping it would strand the schema.
 */
async function resetTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD; BEGIN
      FOR r IN
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

/**
 * Well-formed Cloudinary URLs matching what the upload path writes. The bytes
 * behind them are never fetched during a capture run — `matrix.spec.ts` fulfils
 * image requests with a local placeholder so the gate stays hermetic — but the
 * shape must be realistic because the app builds transforms from it.
 */
const mediaUrl = (index: number, variant: 'thumb' | 'lightbox') =>
  `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/capture/${variant}-${index}.jpg`;

/**
 * Extra spots and sessions that exist purely to fill the browse feed.
 *
 * Without them the feed renders a single card, and one card looks identical at
 * one, two, or three columns — so the baseline would be blind to exactly the
 * `PanelCollectionGrid` column change this gate exists to catch (roadmap F12k).
 *
 * Ids are fixed literals rather than part of `fixtures.ts`: nothing navigates to
 * these, so they are not spec-facing, but they must not vary between runs. Every
 * date is fixed and in the past, so none can match the "Today" filter that the
 * `empty-today` state depends on.
 */
const FEED_FIXTURES = [
  {
    spotId: 'a1e4c2b0-5d38-4f91-8c07-1b6e9d2f4a53',
    sessionId: 'd2f7a913-6b45-4e08-9a31-7c5d0e8b2f16',
    name: 'Uluwatu',
    lat: '-8.81500000',
    lng: '115.08700000',
    startsAt: new Date('2025-06-12T23:00:00.000Z'),
  },
  {
    spotId: 'b3c8d5e1-7a29-4b60-8f14-2d9e6c1a3b48',
    sessionId: 'e4a1b672-8c53-4d19-9e26-3f7a0b5c8d21',
    name: 'Padang Padang',
    lat: '-8.81000000',
    lng: '115.10300000',
    startsAt: new Date('2025-06-10T22:15:00.000Z'),
  },
  {
    spotId: 'c5d9e6f2-8b31-4c72-9a05-4e1f7d2b6c39',
    sessionId: 'f6b2c783-9d64-4e21-8f37-5a2b1c6d9e42',
    name: 'Keramas',
    lat: '-8.59300000',
    lng: '115.32700000',
    startsAt: new Date('2025-06-08T21:45:00.000Z'),
  },
  {
    spotId: 'd7e1f8a3-9c42-4d83-8b16-5f2a8e3c7d51',
    sessionId: 'a8c3d894-0e75-4f32-9a48-6b3c2d7e0f53',
    name: 'Medewi',
    lat: '-8.42100000',
    lng: '114.81500000',
    startsAt: new Date('2025-06-06T22:00:00.000Z'),
  },
  {
    spotId: 'e9f2a4b5-0d53-4e94-8c27-6a3b9f4d8e62',
    sessionId: 'b9d4e905-1f86-4a43-8b59-7c4d3e8f1a64',
    name: 'Balian',
    lat: '-8.45900000',
    lng: '114.99200000',
    startsAt: new Date('2025-06-04T23:30:00.000Z'),
  },
] as const;

/** Media per feed session — enough for a card thumbnail, few enough not to bloat the gallery. */
const FEED_MEDIA_PER_SESSION = 3;

/** Session duration applied to every feed fixture, so card metadata stays uniform. */
const FEED_SESSION_DURATION_MS = 2.5 * 60 * 60 * 1000;

async function createFeedFixtures(photographerId: string): Promise<void> {
  for (const fixture of FEED_FIXTURES) {
    await prisma.spot.create({
      data: {
        id: fixture.spotId,
        name: fixture.name,
        location: 'Bali, Indonesia',
        lat: fixture.lat,
        lng: fixture.lng,
        status: 'verified',
        creatorId: photographerId,
      },
    });

    await prisma.surfSession.create({
      data: {
        id: fixture.sessionId,
        spotId: fixture.spotId,
        photographerId,
        startsAt: fixture.startsAt,
        endsAt: new Date(fixture.startsAt.getTime() + FEED_SESSION_DURATION_MS),
        status: 'PUBLISHED',
        photoPrice: 300,
        videoPrice: 500,
      },
    });

    await prisma.mediaItem.createMany({
      data: Array.from({ length: FEED_MEDIA_PER_SESSION }, (_, index) => ({
        sessionId: fixture.sessionId,
        photographerId,
        spotId: fixture.spotId,
        type: 'PHOTO' as const,
        status: 'PUBLISHED' as const,
        capturedAt: new Date(fixture.startsAt.getTime() + index * 60_000),
        price: 300,
        cloudinaryPublicId: `capture/${fixture.sessionId}-${index}`,
        thumbnailUrl: mediaUrl(index, 'thumb'),
        lightboxUrl: mediaUrl(index, 'lightbox'),
        width: 1600,
        height: 1067,
      })),
    });
  }
}

async function createCaptureAccount(): Promise<string> {
  const { email, password } = readCaptureCredentials();

  await auth.api.signUpEmail({
    body: { email, password, name: 'Capture Reference' },
  });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`Sign-up did not create a user row for ${email}.`);
  return user.id;
}

async function seed(): Promise<void> {
  assertCaptureDatabase();
  await resetTables();

  const photographerId = await createCaptureAccount();

  await prisma.spot.create({
    data: {
      id: CAPTURE_IDS.cangguSpotId,
      name: 'Canggu',
      location: 'Bali, Indonesia',
      lat: '-8.65100000',
      lng: '115.13700000',
      status: 'verified',
      creatorId: photographerId,
    },
  });

  await prisma.surfSession.create({
    data: {
      id: CAPTURE_IDS.cangguSessionId,
      spotId: CAPTURE_IDS.cangguSpotId,
      photographerId,
      startsAt: CAPTURE_DATES.sessionStartsAt,
      endsAt: CAPTURE_DATES.sessionEndsAt,
      status: 'PUBLISHED',
      photoPrice: 300,
      videoPrice: 500,
    },
  });

  // Enough tiles to fill the gallery grid at the widest captured viewport, so a
  // column-count regression shows up as a changed baseline rather than a short row.
  await prisma.mediaItem.createMany({
    data: Array.from({ length: CAPTURE_MEDIA_COUNT }, (_, index) => ({
      sessionId: CAPTURE_IDS.cangguSessionId,
      photographerId,
      spotId: CAPTURE_IDS.cangguSpotId,
      type: 'PHOTO' as const,
      status: 'PUBLISHED' as const,
      // Stagger by a minute so ordering is total and stable across runs.
      capturedAt: new Date(CAPTURE_DATES.capturedAt.getTime() + index * 60_000),
      price: 300,
      cloudinaryPublicId: `capture/photo-${index}`,
      thumbnailUrl: mediaUrl(index, 'thumb'),
      lightboxUrl: mediaUrl(index, 'lightbox'),
      width: 1600,
      height: 1067,
    })),
  });

  // A SAVED (non-draft) workspace: opening it drives the "unavailable" lifecycle
  // state that the `error-upload-workspace` recipe captures.
  await prisma.uploadWorkspace.create({
    data: {
      id: CAPTURE_IDS.unavailableWorkspaceId,
      kind: 'NEW_SESSION',
      status: 'SAVED',
      photographerId,
      spotId: CAPTURE_IDS.cangguSpotId,
      startsAt: CAPTURE_DATES.sessionStartsAt,
      endsAt: CAPTURE_DATES.sessionEndsAt,
    },
  });

  // Earnings with a payout in progress: the balance is what remains after the
  // reserved payout, which is what the earnings screen renders as pending.
  await prisma.user.update({
    where: { id: photographerId },
    data: { balance: 4_200 },
  });

  await prisma.transaction.create({
    data: {
      id: CAPTURE_IDS.payoutTransactionId,
      userId: photographerId,
      amount: -2_500,
      type: TransactionType.PAYOUT,
      status: TransactionStatus.PENDING,
      createdAt: CAPTURE_DATES.payoutRequestedAt,
    },
  });

  await prisma.payoutRequest.create({
    data: {
      id: CAPTURE_IDS.payoutRequestId,
      photographerId,
      transactionId: CAPTURE_IDS.payoutTransactionId,
      amount: 2_500,
      status: PayoutStatus.PROCESSING,
      requestedAt: CAPTURE_DATES.payoutRequestedAt,
    },
  });

  await createFeedFixtures(photographerId);

  console.log(
    `Capture database seeded: ${FEED_FIXTURES.length + 1} spots, `
      + `${FEED_FIXTURES.length + 1} sessions, `
      + `${CAPTURE_MEDIA_COUNT + FEED_FIXTURES.length * FEED_MEDIA_PER_SESSION} media, `
      + '1 unavailable workspace, 1 payout in progress.',
  );
}

seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
