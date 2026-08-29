import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from 'server/db';
import { MediaService } from 'server/services/MediaService';
import { MediaRepository } from './MediaRepository';

const repo = new MediaRepository();

async function clearTestData() {
  await prisma.mediaItem.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.userFavoriteSpot.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.user.deleteMany();
}

beforeEach(clearTestData);
afterAll(async () => {
  await clearTestData();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// hasDraftsByUser
// ---------------------------------------------------------------------------

describe('MediaRepository.hasDraftsByUser', () => {
  it('is true for a genuinely new, never-published draft', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'new-draft@example.com' },
    });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });
    await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        status: 'DRAFT',
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/new-draft.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/new-draft-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/new-draft',
      },
    });

    await expect(repo.hasDraftsByUser(photographer.id)).resolves.toBe(true);
  });

  it('is false for a session reopened for editing, even with a newly added file', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'reopened-edit@example.com' },
    });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });
    // The original, previously-published photo keeps its price, which marks the session as
    // previously published even if legacy unpublished rows still exist.
    await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        status: 'DRAFT',
        price: 700,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/reopened-original.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/reopened-original-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/reopened-original',
      },
    });
    // A file added via "add more" during this same edit — never published, price still null.
    await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        status: 'DRAFT',
        capturedAt: new Date('2026-01-01T07:00:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/reopened-new.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/reopened-new-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/reopened-new',
      },
    });

    await expect(repo.hasDraftsByUser(photographer.id)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findByIdsForFulfillment
// ---------------------------------------------------------------------------

describe('MediaRepository.findByIdsForFulfillment', () => {
  it('returns only PUBLISHED, priced, non-deleted rows', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'fulfillment-filter@example.com' },
    });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const base = {
      sessionId: session.id,
      photographerId: photographer.id,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/img.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/thumb.jpg',
    };

    const published = await prisma.mediaItem.create({
      data: { ...base, status: 'PUBLISHED', price: 700, cloudinaryPublicId: 'swelldays/test/fulfillment-pub' },
    });
    const draft = await prisma.mediaItem.create({
      data: { ...base, status: 'DRAFT', price: 700, cloudinaryPublicId: 'swelldays/test/fulfillment-draft' },
    });
    const noPrice = await prisma.mediaItem.create({
      data: { ...base, status: 'PUBLISHED', price: null, cloudinaryPublicId: 'swelldays/test/fulfillment-no-price' },
    });
    const deleted = await prisma.mediaItem.create({
      data: { ...base, status: 'PUBLISHED', price: 700, deletedAt: new Date(), cloudinaryPublicId: 'swelldays/test/fulfillment-deleted' },
    });

    const results = await repo.findByIdsForFulfillment([published.id, draft.id, noPrice.id, deleted.id]);

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(published.id);
  });

  it('returns the correct fulfillment shape with price as a number', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'fulfillment-shape@example.com' },
    });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const media = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        status: 'PUBLISHED',
        price: 1500,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/shape.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/shape-thumb.jpg',
        cloudinaryPublicId: 'swelldays/users/test/shape',
      },
    });

    const results = await repo.findByIdsForFulfillment([media.id]);

    expect(results).toEqual([{
      id: media.id,
      price: 1500,
      photographerId: photographer.id,
      cloudinaryPublicId: 'swelldays/users/test/shape',
    }]);
  });
});

// ---------------------------------------------------------------------------
// findPublishedBySpot
// ---------------------------------------------------------------------------

describe('MediaRepository.findPublishedBySpot', () => {
  it('returns only media captured in range at spots favorited by the viewer', async () => {
    const viewer = await prisma.user.create({ data: { email: 'gallery-viewer@example.com' } });
    const photographer = await prisma.user.create({ data: { email: 'gallery-photographer@example.com' } });
    const favoriteSpot = await prisma.spot.create({ data: { slug: 'favorite', name: 'Favorite', location: 'North' } });
    const otherSpot = await prisma.spot.create({ data: { slug: 'other', name: 'Other', location: 'South' } });
    await prisma.userFavoriteSpot.create({ data: { userId: viewer.id, spotId: favoriteSpot.id } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const createMedia = (spotId: string, capturedAt: Date, publicId: string) => prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId,
        status: 'PUBLISHED',
        capturedAt,
        lightboxUrl: `https://example.com/${publicId}.jpg`,
        thumbnailUrl: `https://example.com/${publicId}-thumb.jpg`,
        cloudinaryPublicId: publicId,
      },
    });

    const included = await createMedia(favoriteSpot.id, new Date('2026-07-10T10:00:00Z'), 'included');
    await createMedia(otherSpot.id, new Date('2026-07-10T11:00:00Z'), 'other-spot');
    await createMedia(favoriteSpot.id, new Date('2026-07-09T10:00:00Z'), 'out-of-range');

    const { items } = await repo.findPublishedBySpot({
      limit: 10,
      sortOrder: 'desc',
      dateFrom: new Date('2026-07-10T00:00:00Z'),
      dateTo: new Date('2026-07-11T00:00:00Z'),
      favoriteUserId: viewer.id,
    });

    expect(items.map((item) => item.id)).toEqual([included.id]);
  });

  it('excludes draft and deleted rows, returns only PUBLISHED non-deleted for the given spot', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'spot-filter@example.com' },
    });
    const spot = await prisma.spot.create({ data: { slug: 'backdoor', name: 'Backdoor', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const base = {
      sessionId: session.id,
      photographerId: photographer.id,
      spotId: spot.id,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/filter.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/filter-thumb.jpg',
    };

    const published = await prisma.mediaItem.create({
      data: { ...base, status: 'PUBLISHED', cloudinaryPublicId: 'swelldays/test/spot-pub' },
    });
    await prisma.mediaItem.create({
      data: { ...base, status: 'DRAFT', cloudinaryPublicId: 'swelldays/test/spot-draft' },
    });
    await prisma.mediaItem.create({
      data: { ...base, status: 'PUBLISHED', deletedAt: new Date(), cloudinaryPublicId: 'swelldays/test/spot-deleted' },
    });

    const { items } = await repo.findPublishedBySpot({ spotId: spot.id, limit: 10 });

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(published.id);
  });

  it('returns items in capturedAt descending order by default', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'spot-sort@example.com' },
    });
    const spot = await prisma.spot.create({ data: { slug: 'pipeline', name: 'Pipeline', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const base = {
      sessionId: session.id,
      photographerId: photographer.id,
      spotId: spot.id,
      status: 'PUBLISHED' as const,
      lightboxUrl: 'https://res.cloudinary.com/test/sort.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/sort-thumb.jpg',
    };

    const early = await prisma.mediaItem.create({
      data: { ...base, capturedAt: new Date('2026-01-01T06:00:00Z'), cloudinaryPublicId: 'swelldays/test/sort-early' },
    });
    const late = await prisma.mediaItem.create({
      data: { ...base, capturedAt: new Date('2026-01-01T08:00:00Z'), cloudinaryPublicId: 'swelldays/test/sort-late' },
    });

    const { items } = await repo.findPublishedBySpot({ spotId: spot.id, limit: 10 });

    expect(items[0]!.id).toBe(late.id);
    expect(items[1]!.id).toBe(early.id);
  });

  it('paginates: nextCursor present when more exist, null when exhausted; cursor resumes correctly', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'spot-paginate@example.com' },
    });
    const spot = await prisma.spot.create({ data: { slug: 'sunset', name: 'Sunset', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    // Insert 4 items with distinct descending capturedAt (newest first in results)
    for (let i = 0; i < 4; i++) {
      await prisma.mediaItem.create({
        data: {
          sessionId: session.id,
          photographerId: photographer.id,
          spotId: spot.id,
          status: 'PUBLISHED',
          capturedAt: new Date(`2026-01-0${4 - i}T06:00:00Z`),
          lightboxUrl: `https://res.cloudinary.com/test/page-${i}.jpg`,
          thumbnailUrl: `https://res.cloudinary.com/test/page-${i}-thumb.jpg`,
          cloudinaryPublicId: `swelldays/test/paginate-${i}`,
        },
      });
    }

    const firstPage = await repo.findPublishedBySpot({ spotId: spot.id, limit: 2 });
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await repo.findPublishedBySpot({ spotId: spot.id, cursor: firstPage.nextCursor!, limit: 2 });
    expect(secondPage.items).toHaveLength(2);
    expect(secondPage.nextCursor).toBeNull();

    const firstIds = firstPage.items.map(item => item.id);
    const secondIds = secondPage.items.map(item => item.id);
    expect(firstIds.some(id => secondIds.includes(id))).toBe(false);
  });

  it('paginates media sharing an identical capturedAt without skipping or duplicating, in both directions', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'spot-tied-timestamps@example.com' },
    });
    const spot = await prisma.spot.create({ data: { slug: 'tied', name: 'Tied', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const tiedCapturedAt = new Date('2026-01-01T06:00:00Z');
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await prisma.mediaItem.create({
        data: {
          sessionId: session.id,
          photographerId: photographer.id,
          spotId: spot.id,
          status: 'PUBLISHED',
          capturedAt: tiedCapturedAt,
          lightboxUrl: `https://res.cloudinary.com/test/tied-${i}.jpg`,
          thumbnailUrl: `https://res.cloudinary.com/test/tied-${i}-thumb.jpg`,
          cloudinaryPublicId: `swelldays/test/tied-${i}`,
        },
      }));
    }
    const createdIds = created.map(item => item.id).sort();

    async function collectAllPages(sortOrder: 'asc' | 'desc') {
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 10; guard++) {
        const page = await repo.findPublishedBySpot({ spotId: spot.id, limit: 2, sortOrder, cursor });
        seen.push(...page.items.map(item => item.id));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return seen;
    }

    const descending = await collectAllPages('desc');
    expect(descending).toHaveLength(5);
    expect([...descending].sort()).toEqual(createdIds);

    const ascending = await collectAllPages('asc');
    expect(ascending).toHaveLength(5);
    expect([...ascending].sort()).toEqual(createdIds);
  });

  it('returns published media across all spots when no spotId is given, with each item carrying its own spot', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'all-spots@example.com' },
    });
    const spotA = await prisma.spot.create({ data: { slug: 'backdoor', name: 'Backdoor', location: 'North Shore' } });
    const spotB = await prisma.spot.create({ data: { slug: 'pipeline', name: 'Pipeline', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });

    const itemA = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId: spotA.id,
        status: 'PUBLISHED',
        capturedAt: new Date('2026-01-01T06:00:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/all-a.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/all-a-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/all-spots-a',
      },
    });
    const itemB = await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId: spotB.id,
        status: 'PUBLISHED',
        capturedAt: new Date('2026-01-01T08:00:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/all-b.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/all-b-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/all-spots-b',
      },
    });

    const { items } = await repo.findPublishedBySpot({ limit: 10 });

    expect(items.map(item => item.id).sort()).toEqual([itemA.id, itemB.id].sort());
    const foundA = items.find(item => item.id === itemA.id)!;
    const foundB = items.find(item => item.id === itemB.id)!;
    expect(foundA.spot).toEqual({ id: spotA.id, name: 'Backdoor' });
    expect(foundB.spot).toEqual({ id: spotB.id, name: 'Pipeline' });
  });

  // S3: the public feed is what anonymous viewers receive; storage-internal
  // fields must never ride along. Runs through the real MediaService so the
  // asserted object is exactly what the route serializes.
  it('exposes no storage-internal fields on the public feed projection', async () => {
    const viewer = await prisma.user.create({ data: { email: 'projection-viewer@example.com' } });
    const photographer = await prisma.user.create({
      data: { email: 'projection-photographer@example.com', name: 'Projection Tester' },
    });
    const spot = await prisma.spot.create({ data: { slug: 'uluwatu', name: 'Uluwatu', location: 'Bukit' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });
    await prisma.mediaItem.create({
      data: {
        sessionId: session.id,
        photographerId: photographer.id,
        spotId: spot.id,
        status: 'PUBLISHED',
        price: 300,
        capturedAt: new Date('2026-01-01T06:30:00Z'),
        lightboxUrl: 'https://res.cloudinary.com/test/projection.jpg',
        thumbnailUrl: 'https://res.cloudinary.com/test/projection-thumb.jpg',
        cloudinaryPublicId: 'swelldays/test/projection',
      },
    });

    const service = new MediaService(repo, { deleteAsset: async () => undefined as never });
    const { items } = await service.findPublishedBySpot({ spotId: spot.id, limit: 10 }, viewer.id);

    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item).toMatchObject({
      type: 'PHOTO',
      price: 300,
      spotId: spot.id,
      spot: { id: spot.id, name: 'Uluwatu' },
      photographerId: photographer.id,
      photographer: { id: photographer.id, name: 'Projection Tester' },
      viewerEntitlement: { purchaseState: 'none' },
    });
    for (const internalField of ['cloudinaryPublicId', 'sessionId', 'status', 'createdAt', 'deletedAt', 'resource']) {
      expect(item).not.toHaveProperty(internalField);
    }
  });
});

describe('MediaRepository.findPublishedDates', () => {
  it('returns one entry per distinct calendar day in descending order, not every media timestamp', async () => {
    const viewer = await prisma.user.create({ data: { email: 'date-index-viewer@example.com' } });
    const photographer = await prisma.user.create({ data: { email: 'date-index-photographer@example.com' } });
    const favoriteSpot = await prisma.spot.create({ data: { slug: 'indexed', name: 'Indexed', location: 'North' } });
    const otherSpot = await prisma.spot.create({ data: { slug: 'excluded', name: 'Excluded', location: 'South' } });
    await prisma.userFavoriteSpot.create({ data: { userId: viewer.id, spotId: favoriteSpot.id } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });
    const base = {
      sessionId: session.id,
      photographerId: photographer.id,
      status: 'PUBLISHED' as const,
      lightboxUrl: 'https://example.com/date-index.jpg',
      thumbnailUrl: 'https://example.com/date-index-thumb.jpg',
    };
    const june = new Date('2026-06-25T10:00:00Z');
    const july = new Date('2026-07-21T10:00:00Z');
    const julySameDayLater = new Date('2026-07-21T18:00:00Z');

    await prisma.mediaItem.create({
      data: { ...base, spotId: favoriteSpot.id, capturedAt: june, cloudinaryPublicId: 'date-index-june' },
    });
    await prisma.mediaItem.create({
      data: { ...base, spotId: favoriteSpot.id, capturedAt: july, cloudinaryPublicId: 'date-index-july' },
    });
    // A second photo the same UTC calendar day as `july`, at a different hour —
    // must collapse to the same one entry, not appear as a second day.
    await prisma.mediaItem.create({
      data: { ...base, spotId: favoriteSpot.id, capturedAt: julySameDayLater, cloudinaryPublicId: 'date-index-july-2' },
    });
    await prisma.mediaItem.create({
      data: { ...base, spotId: otherSpot.id, capturedAt: new Date('2026-05-01T10:00:00Z'), cloudinaryPublicId: 'date-index-other' },
    });
    await prisma.mediaItem.create({
      data: {
        ...base,
        spotId: favoriteSpot.id,
        status: 'DRAFT',
        capturedAt: new Date('2026-04-01T10:00:00Z'),
        cloudinaryPublicId: 'date-index-draft',
      },
    });

    // Descending order keeps the first-encountered row per day, i.e. the
    // latest timestamp of that day — julySameDayLater, not july itself.
    await expect(repo.findPublishedDates({
      favoriteUserId: viewer.id,
    })).resolves.toEqual([julySameDayLater, june]);
  });
});

describe('MediaRepository.findPublishedBySpotBefore', () => {
  async function seedFiveTiedMedia() {
    const photographer = await prisma.user.create({ data: { email: `before-tied-${crypto.randomUUID()}@example.com` } });
    const spot = await prisma.spot.create({ data: { slug: 'tied-before', name: 'Tied Before', location: 'North Shore' } });
    const session = await prisma.surfSession.create({
      data: { photographerId: photographer.id, status: 'PUBLISHED' },
    });
    const tiedCapturedAt = new Date('2026-01-01T06:00:00Z');
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await prisma.mediaItem.create({
        data: {
          sessionId: session.id,
          photographerId: photographer.id,
          spotId: spot.id,
          status: 'PUBLISHED',
          capturedAt: tiedCapturedAt,
          lightboxUrl: `https://res.cloudinary.com/test/before-tied-${i}.jpg`,
          thumbnailUrl: `https://res.cloudinary.com/test/before-tied-${i}-thumb.jpg`,
          cloudinaryPublicId: `swelldays/test/before-tied-${i}`,
        },
      }));
    }
    return { spot, createdIds: created.map((item) => item.id).sort() };
  }

  it('fetches newer items than the cursor, in normal display order, without skipping or duplicating ties', async () => {
    const { spot, createdIds } = await seedFiveTiedMedia();

    // Walk forward (older) all the way to the end first.
    let forwardCursor: string | undefined;
    let lastPage = await repo.findPublishedBySpot({ spotId: spot.id, cursor: forwardCursor, limit: 2 });
    for (let guard = 0; guard < 10 && lastPage.nextCursor; guard++) {
      forwardCursor = lastPage.nextCursor;
      lastPage = await repo.findPublishedBySpot({ spotId: spot.id, cursor: forwardCursor, limit: 2 });
    }
    expect(lastPage.prevCursor).not.toBeNull();

    // Now walk newer (before) exclusively, from the oldest page back to the start —
    // a single continuous path so nothing already collected can be seen twice.
    const seen: string[] = [...lastPage.items.map((i) => i.id)];
    let cursor = lastPage.prevCursor!;
    for (let guard = 0; guard < 10; guard++) {
      const page = await repo.findPublishedBySpotBefore({ spotId: spot.id, cursor, limit: 2 });
      seen.push(...page.items.map((i) => i.id));
      if (!page.prevCursor) break;
      cursor = page.prevCursor;
    }

    expect(seen).toHaveLength(5);
    expect([...seen].sort()).toEqual(createdIds);
  });

  it('reconstructs the original forward page when chained after→before, proving the seam is consistent', async () => {
    const { spot } = await seedFiveTiedMedia();

    const firstPage = await repo.findPublishedBySpot({ spotId: spot.id, limit: 3 });
    const secondPage = await repo.findPublishedBySpot({ spotId: spot.id, cursor: firstPage.nextCursor!, limit: 3 });
    expect(secondPage.items).toHaveLength(2);

    const reconstructedFirstPage = await repo.findPublishedBySpotBefore({
      spotId: spot.id,
      cursor: secondPage.prevCursor!,
      limit: 3,
    });

    expect(reconstructedFirstPage.items.map((i) => i.id)).toEqual(firstPage.items.map((i) => i.id));
    expect(reconstructedFirstPage.prevCursor).toBeNull();

    // Its own nextCursor (built from its own last item, not secondPage's cursor)
    // must still continue forward into exactly secondPage, closing the loop.
    const continued = await repo.findPublishedBySpot({
      spotId: spot.id,
      cursor: reconstructedFirstPage.nextCursor!,
      limit: 3,
    });
    expect(continued.items.map((i) => i.id)).toEqual(secondPage.items.map((i) => i.id));
  });

  it('returns an empty page with null cursors when nothing is newer than the cursor', async () => {
    const { spot } = await seedFiveTiedMedia();

    // limit: 1 with no incoming cursor fetches exactly the newest item; its
    // own nextCursor is therefore a real cursor pointing at that newest item.
    const newestOnly = await repo.findPublishedBySpot({ spotId: spot.id, limit: 1 });
    expect(newestOnly.items).toHaveLength(1);
    expect(newestOnly.nextCursor).not.toBeNull();

    const beforeNewest = await repo.findPublishedBySpotBefore({
      spotId: spot.id,
      cursor: newestOnly.nextCursor!,
      limit: 5,
    });

    expect(beforeNewest.items).toEqual([]);
    expect(beforeNewest.prevCursor).toBeNull();
    expect(beforeNewest.nextCursor).toBeNull();
  });
});
