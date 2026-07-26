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

/**
 * Well-formed Cloudinary URLs matching what the upload path writes. The bytes
 * behind them are never fetched during a capture run — `matrix.spec.ts` fulfils
 * image requests with a local placeholder so the gate stays hermetic — but the
 * shape must be realistic because the app builds transforms from it.
 */
const mediaUrl = (index: number, variant: 'thumb' | 'lightbox') =>
  `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/capture/${variant}-${index}.jpg`;

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
      aliases: ['Echo Beach', 'Batu Bolong'],
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

  console.log(
    `Capture database seeded: 1 spot, 1 session, ${CAPTURE_MEDIA_COUNT} media, `
      + '1 unavailable workspace, 1 payout in progress.',
  );
}

seed()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
