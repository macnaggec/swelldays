import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from 'server/db';
import { MediaFavoriteRepository } from './MediaFavoriteRepository';

const repository = new MediaFavoriteRepository();

async function clearTestData() {
  await prisma.userFavoriteMedia.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.user.deleteMany();
}

async function fixture() {
  const photographer = await prisma.user.create({ data: { email: 'favorite-photographer@example.com' } });
  const viewer = await prisma.user.create({ data: { email: 'favorite-viewer@example.com' } });
  const otherViewer = await prisma.user.create({ data: { email: 'favorite-other@example.com' } });
  const spot = await prisma.spot.create({ data: { slug: 'pipeline', name: 'Pipeline', location: 'Oahu' } });
  const session = await prisma.surfSession.create({
    data: { photographerId: photographer.id, spotId: spot.id, status: 'PUBLISHED' },
  });
  const media = await prisma.mediaItem.create({ data: {
    sessionId: session.id, photographerId: photographer.id, spotId: spot.id,
    status: 'PUBLISHED', price: 300, capturedAt: new Date('2026-04-01T10:00:00Z'),
    lightboxUrl: 'https://example.com/lightbox.jpg', thumbnailUrl: 'https://example.com/thumb.jpg',
    cloudinaryPublicId: 'favorite-media-1',
  } });
  return { photographer, viewer, otherViewer, spot, session, media };
}

beforeEach(clearTestData);
afterAll(async () => { await clearTestData(); await prisma.$disconnect(); });

describe('MediaFavoriteRepository', () => {
  it('adds and removes a favorite idempotently and isolates users', async () => {
    const { viewer, otherViewer, media } = await fixture();
    await repository.add(viewer.id, media.id);
    await repository.add(viewer.id, media.id);

    await expect(repository.findIdsByUser(viewer.id)).resolves.toEqual([media.id]);
    await expect(repository.findIdsByUser(otherViewer.id)).resolves.toEqual([]);

    await repository.remove(viewer.id, media.id);
    await repository.remove(viewer.id, media.id);
    await expect(repository.findIdsByUser(viewer.id)).resolves.toEqual([]);
  });

  it('returns visible favorites newest-first and excludes draft or deleted media', async () => {
    const { viewer, photographer, spot, session, media } = await fixture();
    const older = await prisma.mediaItem.create({ data: {
      sessionId: session.id, photographerId: photographer.id, spotId: spot.id,
      status: 'PUBLISHED', price: 300, capturedAt: new Date('2026-03-01T10:00:00Z'),
      lightboxUrl: 'https://example.com/older.jpg', thumbnailUrl: 'https://example.com/older-thumb.jpg',
      cloudinaryPublicId: 'favorite-media-older',
    } });
    const draft = await prisma.mediaItem.create({ data: {
      sessionId: session.id, photographerId: photographer.id, spotId: spot.id,
      status: 'DRAFT', capturedAt: new Date(), lightboxUrl: 'draft', thumbnailUrl: 'draft', cloudinaryPublicId: 'favorite-draft',
    } });
    await prisma.userFavoriteMedia.createMany({ data: [
      { userId: viewer.id, mediaItemId: older.id, createdAt: new Date('2026-07-01T10:00:00Z') },
      { userId: viewer.id, mediaItemId: media.id, createdAt: new Date('2026-07-02T10:00:00Z') },
      { userId: viewer.id, mediaItemId: draft.id, createdAt: new Date('2026-07-03T10:00:00Z') },
    ] });

    await expect(repository.findIdsByUser(viewer.id)).resolves.toEqual([media.id, older.id]);
    await prisma.mediaItem.update({ where: { id: media.id }, data: { deletedAt: new Date() } });
    await expect(repository.findIdsByUser(viewer.id)).resolves.toEqual([older.id]);
  });
});
