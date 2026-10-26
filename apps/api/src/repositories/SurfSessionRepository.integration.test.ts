import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from 'server/db';
import { SurfSessionRepository } from './SurfSessionRepository';
import { randomUUID } from 'node:crypto';

const repository = new SurfSessionRepository();

async function clearTestData() {
  await prisma.payoutRequest.deleteMany(); await prisma.transaction.deleteMany();
  await prisma.paymentAdjustmentAllocation.deleteMany(); await prisma.paymentAdjustment.deleteMany();
  await prisma.paidOrderLine.deleteMany(); await prisma.paymentNotification.deleteMany(); await prisma.paymentAttempt.deleteMany();
  await prisma.uploadAttempt.deleteMany();
  await prisma.uploadWorkspaceAsset.deleteMany();
  await prisma.uploadWorkspaceMediaChange.deleteMany();
  await prisma.uploadWorkspace.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.orderItem.deleteMany(); await prisma.order.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(clearTestData);
afterAll(async () => {
  await clearTestData();
  await prisma.$disconnect();
});

describe('SurfSession time window constraint', () => {
  it('rejects persisting a complete session whose end is before its start', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'invalid-window@example.com' },
    });

    await expect(prisma.surfSession.create({
      data: {
        photographerId: photographer.id,
        startsAt: new Date('2026-01-01T09:00:00Z'),
        endsAt: new Date('2026-01-01T08:00:00Z'),
        status: 'PUBLISHED',
      },
    })).rejects.toThrow();
  });
});

describe('SurfSession media ownership constraint', () => {
  it('rejects persisting media without a surf session', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'sessionless-media@example.com' },
    });

    await expect(prisma.$executeRaw`
      INSERT INTO media_items (
        id,
        photographer_id,
        captured_at,
        lightbox_url,
        cloudinary_public_id,
        thumbnail_url
      ) VALUES (
        ${randomUUID()},
        ${photographer.id},
        ${new Date('2026-01-01T06:30:00Z')},
        ${'https://res.cloudinary.com/test/sessionless.jpg'},
        ${'swelldays/users/test/sessionless'},
        ${'https://res.cloudinary.com/test/sessionless-thumb.jpg'}
      )
    `).rejects.toThrow();
  });
});

describe('SurfSessionRepository.retire', () => {
  it('hard-deletes never-purchased media and reports it for Cloudinary cleanup', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'retire-session@example.com' },
    });
    const spot = await prisma.spot.create({
      data: { slug: 'pipeline', name: 'Pipeline', location: 'North Shore' },
    });
    const session = await prisma.surfSession.create({
      data: {
        photographerId: photographer.id,
        spotId: spot.id,
        startsAt: new Date('2026-01-01T06:00:00Z'),
        endsAt: new Date('2026-01-01T08:00:00Z'),
        status: 'PUBLISHED',
      },
    });
    const media = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId: spot.id,
        type: 'PHOTO',
        status: 'PUBLISHED',
        price: 700,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/retire.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/retire-thumb.jpg',
        cloudinaryPublicId: 'swelldays/users/test/retire',
      },
    });

    const result = await repository.retire(session.id, photographer.id);

    expect(await prisma.surfSession.findUnique({ where: { id: session.id } })).toMatchObject({
      status: 'DELETED',
    });
    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toBeNull();
    expect(result.hardDeletedAssets).toEqual([
      { cloudinaryPublicId: 'swelldays/users/test/retire', resourceType: 'PHOTO' },
    ]);
  });

  it('soft-deletes already-purchased media instead of hard-deleting it', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'retire-purchased-session@example.com' },
    });
    const spot = await prisma.spot.create({
      data: { slug: 'pipeline', name: 'Pipeline', location: 'North Shore' },
    });
    const session = await prisma.surfSession.create({
      data: {
        photographerId: photographer.id,
        spotId: spot.id,
        startsAt: new Date('2026-01-01T06:00:00Z'),
        endsAt: new Date('2026-01-01T08:00:00Z'),
        status: 'PUBLISHED',
      },
    });
    const media = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId: spot.id,
        type: 'PHOTO',
        status: 'PUBLISHED',
        price: 700,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/retire-purchased.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/retire-purchased-thumb.jpg',
        cloudinaryPublicId: 'swelldays/users/test/retire-purchased',
      },
    });
    await prisma.purchase.create({
      data: {
        mediaItemId: media.id,
        amountPaid: 700,
        platformFee: 70,
        photographerEarned: 630,
      },
    });

    const result = await repository.retire(session.id, photographer.id);

    expect(await prisma.mediaItem.findUnique({ where: { id: media.id } })).toMatchObject({
      status: 'DELETED',
    });
    expect(result.hardDeletedAssets).toEqual([]);
  });

  it('retains the Cloudinary asset for a paid compensation exception without a Purchase entitlement', async () => {
    const photographer = await prisma.user.create({ data: { email: 'exception-seller@example.com' } });
    const buyer = await prisma.user.create({ data: { email: 'exception-buyer@example.com' } });
    const session = await prisma.surfSession.create({ data: { photographerId: photographer.id, status: 'PUBLISHED' } });
    const media = await prisma.mediaItem.create({ data: { sessionId: session.id, photographerId: photographer.id,
      type: 'PHOTO', status: 'PUBLISHED', price: 700, capturedAt: new Date(), lightboxUrl: 'exception-lightbox',
      thumbnailUrl: 'exception-thumb', cloudinaryPublicId: 'exception-asset' } });
    const order = await prisma.order.create({ data: { buyerId: buyer.id, clientRequestId: randomUUID(), totalAmount: 700,
      status: 'COMPLETED', externalOrderId: randomUUID(), items: { create: { mediaItemId: media.id,
        unitAmountCents: 700, currency: 'USD', sellerId: photographer.id, feePolicyVersion: 'standard-20-v1',
        platformFeeAmount: 140, sellerEarningsAmount: 560, deliverablePublicId: media.cloudinaryPublicId,
        deliverableType: 'PHOTO' } } }, include: { items: true } });
    const attempt = await prisma.paymentAttempt.create({ data: { orderId: order.id, provider: 'PADDLE',
      environment: 'SANDBOX', providerTransactionId: randomUUID(), creationState: 'READY',
      expectedAmountCents: 700, expectedCurrency: 'USD' } });
    await prisma.paidOrderLine.create({ data: { paymentAttemptId: attempt.id, orderItemId: order.items[0]!.id,
      orderId: order.id, mediaItemId: media.id, sellerId: photographer.id, buyerId: buyer.id,
      amountPaid: 700, platformFee: 140, sellerEarnings: 560, currency: 'USD',
      deliverablePublicId: media.cloudinaryPublicId, deliverableType: 'PHOTO',
      deliveryStatus: 'COMPENSATION_REQUIRED', exceptionReason: 'duplicate-entitlement' } });

    const result = await repository.retire(session.id, photographer.id);

    expect(result.hardDeletedAssets).toEqual([]);
    expect(await prisma.mediaItem.findUniqueOrThrow({ where: { id: media.id } })).toMatchObject({ status: 'DELETED' });
  });
});

describe('SurfSessionRepository.listPublished favorites filter', () => {
  it('returns paginated sessions at the viewer favorite spots within the date range', async () => {
    const viewer = await prisma.user.create({ data: { email: 'viewer@example.com' } });
    const photographer = await prisma.user.create({ data: { email: 'feed-photographer@example.com' } });
    const favoriteSpot = await prisma.spot.create({ data: { slug: 'favorite', name: 'Favorite', location: 'North' } });
    const otherSpot = await prisma.spot.create({ data: { slug: 'other', name: 'Other', location: 'South' } });
    await prisma.userFavoriteSpot.create({ data: { userId: viewer.id, spotId: favoriteSpot.id } });

    const createSession = (spotId: string, startsAt: Date, createdAt: Date) =>
      prisma.surfSession.create({
        data: {
          photographerId: photographer.id,
          spotId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          createdAt,
          status: 'PUBLISHED',
          mediaItems: { create: { spotId, status: 'PUBLISHED', type: 'PHOTO', capturedAt: startsAt, price: 700, cloudinaryPublicId: randomUUID(), lightboxUrl: 'https://example.com/preview.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' } },
        },
      });

    const newestFavorite = await createSession(
      favoriteSpot.id,
      new Date('2026-07-10T10:00:00Z'),
      new Date('2026-07-10T12:00:00Z'),
    );
    const olderFavorite = await createSession(
      favoriteSpot.id,
      new Date('2026-07-10T08:00:00Z'),
      new Date('2026-07-10T11:00:00Z'),
    );
    await createSession(otherSpot.id, new Date('2026-07-10T09:00:00Z'), new Date('2026-07-10T13:00:00Z'));
    await createSession(favoriteSpot.id, new Date('2026-07-08T09:00:00Z'), new Date('2026-07-10T14:00:00Z'));

    const filter = {
      limit: 1,
      dateFrom: new Date('2026-07-10T00:00:00Z'),
      dateTo: new Date('2026-07-11T00:00:00Z'),
      favoriteUserId: viewer.id,
    };
    const firstPage = await repository.listPublished(filter);
    const secondPage = await repository.listPublished({ ...filter, cursor: firstPage.nextCursor ?? undefined });

    expect(firstPage.items.map((session) => session.id)).toEqual([newestFavorite.id]);
    expect(secondPage.items.map((session) => session.id)).toEqual([olderFavorite.id]);
    expect(secondPage.nextCursor).toBeNull();
  });
});


describe('public discovery completeness and pagination', () => {
  it('walks tied dates without gaps and excludes draft, deleted, empty and deleted-media sessions', async () => {
    const photographer = await prisma.user.create({ data: { email: 'seo-pagination@example.com' } });
    const spot = await prisma.spot.create({ data: { slug: 'seo-test', name: 'SEO test', location: 'Test coast' } });
    const startsAt = new Date('2026-01-01T10:00:00Z');
    const endsAt = new Date('2026-01-01T11:00:00Z');
    const publicIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const session = await prisma.surfSession.create({ data: {
        photographerId: photographer.id, spotId: spot.id, startsAt, endsAt, status: 'PUBLISHED',
        mediaItems: { create: { spotId: spot.id, capturedAt: startsAt, status: 'PUBLISHED', price: 700, cloudinaryPublicId: randomUUID(), lightboxUrl: 'https://example.com/preview.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' } },
      } });
      publicIds.push(session.id);
    }
    for (const status of ['DELETED', 'PUBLISHED'] as const) {
      await prisma.surfSession.create({ data: { photographerId: photographer.id, spotId: spot.id, startsAt, endsAt, status } });
    }
    await prisma.surfSession.create({ data: {
      photographerId: photographer.id, spotId: spot.id, startsAt, endsAt, status: 'PUBLISHED',
      mediaItems: { create: { spotId: spot.id, capturedAt: startsAt, status: 'PUBLISHED', deletedAt: new Date(), price: 700, cloudinaryPublicId: randomUUID(), lightboxUrl: 'https://example.com/preview.jpg', thumbnailUrl: 'https://example.com/thumb.jpg' } },
    } });
    await prisma.uploadWorkspace.create({ data: { photographerId: photographer.id, spotId: spot.id, kind: 'NEW_SESSION', status: 'ACTIVE' } });
    const found: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await repository.listPublished({ limit: 2, cursor });
      found.push(...page.items.map((session) => session.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(found).toEqual(publicIds.sort().reverse());
    expect(new Set(found).size).toBe(5);
    await prisma.mediaItem.updateMany({ where: { sessionId: found[0] }, data: { deletedAt: new Date() } });
    const remaining = await repository.listPublished({ limit: 20 });
    expect(remaining.items.map((session) => session.id)).toEqual(found.slice(1));
  });
});
