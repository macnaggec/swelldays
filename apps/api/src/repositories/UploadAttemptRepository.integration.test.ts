import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from 'server/db';
import { randomUUID } from 'node:crypto';
import { UploadAttemptRepository } from './UploadAttemptRepository';

const repo = new UploadAttemptRepository();

async function clearTestData() {
  await prisma.mediaItem.deleteMany();
  await prisma.uploadAttempt.deleteMany();
  await prisma.uploadWorkspaceAsset.deleteMany();
  await prisma.uploadWorkspaceMediaChange.deleteMany();
  await prisma.uploadWorkspace.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.user.deleteMany();
}

async function seedPhotographerAndWorkspace() {
  const user = await prisma.user.create({ data: { email: `test-${randomUUID()}@example.com` } });
  const workspace = await prisma.uploadWorkspace.create({
    data: { photographerId: user.id, kind: 'NEW_SESSION' },
  });
  return { photographerId: user.id, workspaceId: workspace.id };
}

beforeEach(clearTestData);
afterAll(async () => { await clearTestData(); await prisma.$disconnect(); });

describe('beginLocalIdempotent', () => {
  it('returns the same attempt on a duplicate clientRequestId inside a workspace', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const input = {
      clientRequestId: randomUUID(),
      workspaceId,
      photographerId,
      cloudinaryPublicId: `swelldays/users/${photographerId}/test-${randomUUID()}`,
      expectedMediaType: 'PHOTO' as const,
      uploadGrantExpiresAt: new Date(Date.now() + 60_000),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const first = await repo.beginLocalIdempotent(input);
    const second = await repo.beginLocalIdempotent(input);

    expect(second.id).toBe(first.id);
    expect(await prisma.uploadAttempt.count({ where: { photographerId, workspaceId } })).toBe(1);
  });
});

describe('finalizeIntoWorkspace', () => {
  it('creates one workspace asset and marks attempt COMPLETED atomically', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const attempt = await prisma.uploadAttempt.create({
      data: {
        clientRequestId: randomUUID(),
        workspaceId,
        photographerId,
        source: 'LOCAL',
        status: 'READY',
        cloudinaryPublicId: `test/${randomUUID()}`,
        expectedMediaType: 'PHOTO',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const asset = await repo.finalizeIntoWorkspace(attempt.id, photographerId, {
      capturedAt: new Date('2026-01-15T08:00:00Z'),
      thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/t_thumb/test.jpg',
      lightboxUrl: 'https://res.cloudinary.com/demo/image/upload/test.jpg',
      resourceType: 'PHOTO' as const,
      width: 1920,
      height: 1080,
    });

    expect(asset.uploadAttemptId).toBe(attempt.id);
    expect(await prisma.mediaItem.count()).toBe(0);
    const updated = await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(updated.status).toBe('COMPLETED');
    expect(await prisma.uploadWorkspaceAsset.count({ where: { workspaceId } })).toBe(1);
  });

  it('throws and creates no workspace asset when attempt is CANCEL_REQUESTED', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const attempt = await prisma.uploadAttempt.create({
      data: {
        clientRequestId: randomUUID(),
        workspaceId,
        photographerId,
        source: 'LOCAL',
        status: 'CANCEL_REQUESTED',
        cloudinaryPublicId: `test/${randomUUID()}`,
        expectedMediaType: 'PHOTO',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await expect(
      repo.finalizeIntoWorkspace(attempt.id, photographerId, {
        capturedAt: new Date(),
        thumbnailUrl: 'https://example.com/thumb.jpg',
        lightboxUrl: 'https://example.com/full.jpg',
        width: 1920,
        height: 1080,
        resourceType: 'PHOTO' as const,
      }),
    ).rejects.toThrow();

    expect(await prisma.uploadWorkspaceAsset.count({ where: { workspaceId } })).toBe(0);
  });
});

describe('cancelAttempt', () => {
  it('transitions READY to CANCEL_REQUESTED', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const attempt = await prisma.uploadAttempt.create({
      data: {
        clientRequestId: randomUUID(), workspaceId, photographerId,
        source: 'LOCAL', status: 'READY',
        cloudinaryPublicId: `test/${randomUUID()}`,
        expectedMediaType: 'PHOTO',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await repo.cancelAttempt(attempt.id, photographerId);
    const updated = await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(updated.status).toBe('CANCEL_REQUESTED');
  });
});

describe('cancelAttemptsForWorkspace', () => {
  it('cancels every in-flight attempt for the workspace in one sweep', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const [inFlight1, inFlight2, alreadyCompleted] = await Promise.all([
      prisma.uploadAttempt.create({ data: { clientRequestId: randomUUID(), workspaceId, photographerId, source: 'LOCAL', status: 'READY', cloudinaryPublicId: `p/${randomUUID()}`, expectedMediaType: 'PHOTO', expiresAt: new Date(Date.now() + 3_600_000) } }),
      prisma.uploadAttempt.create({ data: { clientRequestId: randomUUID(), workspaceId, photographerId, source: 'LOCAL', status: 'FINALIZING', cloudinaryPublicId: `p/${randomUUID()}`, expectedMediaType: 'PHOTO', expiresAt: new Date(Date.now() + 3_600_000) } }),
      prisma.uploadAttempt.create({ data: { clientRequestId: randomUUID(), workspaceId, photographerId, source: 'LOCAL', status: 'COMPLETED', cloudinaryPublicId: `p/${randomUUID()}`, expectedMediaType: 'PHOTO', expiresAt: new Date(Date.now() + 3_600_000) } }),
    ]);

    await repo.cancelAttemptsForWorkspace(workspaceId, photographerId);

    expect((await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: inFlight1.id } })).status).toBe('CANCEL_REQUESTED');
    expect((await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: inFlight2.id } })).status).toBe('CANCEL_REQUESTED');
    expect((await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: alreadyCompleted.id } })).status).toBe('COMPLETED');
  });
});
