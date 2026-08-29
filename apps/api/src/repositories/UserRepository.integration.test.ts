import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from 'server/db';
import { UserRepository } from './UserRepository';

const repository = new UserRepository();

async function clearTestData() {
  await prisma.transaction.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function fixture({ balance = 0 }: { balance?: number } = {}) {
  const photographer = await prisma.user.create({
    data: { email: 'leaving@example.com', name: 'Kai', balance },
  });
  const spot = await prisma.spot.create({
    data: { slug: 'pipeline', name: 'Pipeline', location: 'Oahu', creatorId: photographer.id },
  });
  const session = await prisma.surfSession.create({
    data: { photographerId: photographer.id, spotId: spot.id, status: 'PUBLISHED' },
  });
  const media = await prisma.mediaItem.create({
    data: {
      sessionId: session.id,
      photographerId: photographer.id,
      spotId: spot.id,
      status: 'PUBLISHED',
      price: 300,
      capturedAt: new Date('2026-04-01T10:00:00Z'),
      lightboxUrl: 'https://example.com/lightbox.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      cloudinaryPublicId: 'leaving-media-1',
    },
  });
  await prisma.session.create({
    data: {
      userId: photographer.id,
      token: 'session-token-1',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
    },
  });
  await prisma.account.create({
    data: {
      issuer: 'local:credential',
      userId: photographer.id,
      accountId: photographer.id,
      providerId: 'credential',
      password: 'hashed',
    },
  });

  return { photographer, spot, session, media };
}

beforeEach(clearTestData);
afterAll(clearTestData);

describe('UserRepository.anonymizeAndDelete', () => {
  it('anonymizes the user and revokes every way back into the account', async () => {
    const { photographer } = await fixture();

    await repository.anonymizeAndDelete(photographer.id);

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(deleted.name).toBe('Deleted User');
    expect(deleted.email).toBe(`deleted_${photographer.id}@deleted.invalid`);
    expect(deleted.deletedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: photographer.id } })).toBe(0);
    expect(await prisma.account.count({ where: { userId: photographer.id } })).toBe(0);
  });

  it('retires published work so it cannot keep selling into an unreachable account', async () => {
    const { photographer, session, media } = await fixture();

    await repository.anonymizeAndDelete(photographer.id);

    const retiredMedia = await prisma.mediaItem.findUniqueOrThrow({ where: { id: media.id } });
    expect(retiredMedia.status).toBe('DELETED');
    expect(retiredMedia.deletedAt).not.toBeNull();

    const retiredSession = await prisma.surfSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(retiredSession.status).toBe('DELETED');
  });

  it('forfeits the remaining balance and records where the money went', async () => {
    const { photographer } = await fixture({ balance: 4500 });

    await repository.anonymizeAndDelete(photographer.id);

    const deleted = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(deleted.balance).toBe(0);

    const forfeit = await prisma.transaction.findFirstOrThrow({
      where: { userId: photographer.id, type: 'FORFEIT' },
    });
    expect(forfeit.amount).toBe(-4500);
    expect(forfeit.status).toBe('COMPLETED');
  });

  it('records no forfeit when there was no balance to forfeit', async () => {
    const { photographer } = await fixture();

    await repository.anonymizeAndDelete(photographer.id);

    expect(
      await prisma.transaction.count({ where: { userId: photographer.id, type: 'FORFEIT' } }),
    ).toBe(0);
  });

  it('keeps spots visible by releasing the creator reference', async () => {
    const { photographer, spot } = await fixture();

    await repository.anonymizeAndDelete(photographer.id);

    const orphaned = await prisma.spot.findUniqueOrThrow({ where: { id: spot.id } });
    expect(orphaned.creatorId).toBeNull();
  });
});
