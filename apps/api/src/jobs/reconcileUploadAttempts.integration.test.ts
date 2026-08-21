import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({ deleteAsset: vi.fn().mockResolvedValue(undefined) }));
vi.mock('server/services/CloudinaryService', () => ({ cloudinaryService: mocks }));

import { reconcileUploadAttempts } from './reconcileUploadAttempts';

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

beforeEach(async () => {
  await clearTestData();
  mocks.deleteAsset.mockClear();
});
afterAll(async () => { await clearTestData(); await prisma.$disconnect(); });

describe('reconcileUploadAttempts', () => {
  it('drains a stale attempt past its expiry window', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const stale = await prisma.uploadAttempt.create({
      data: {
        clientRequestId: randomUUID(), workspaceId, photographerId,
        source: 'LOCAL', status: 'READY',
        cloudinaryPublicId: `test/${randomUUID()}`,
        expectedMediaType: 'PHOTO',
        expiresAt: new Date(Date.now() - 60_000),
      },
    });

    await reconcileUploadAttempts();

    expect(mocks.deleteAsset).toHaveBeenCalledWith(stale.cloudinaryPublicId, 'image');
    const updated = await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: stale.id } });
    expect(updated.status).toBe('CANCELLED');
  });

  it('does not reclaim an active in-window attempt', async () => {
    const { photographerId, workspaceId } = await seedPhotographerAndWorkspace();
    const active = await prisma.uploadAttempt.create({
      data: {
        clientRequestId: randomUUID(), workspaceId, photographerId,
        source: 'LOCAL', status: 'ACQUIRING',
        cloudinaryPublicId: `test/${randomUUID()}`,
        expectedMediaType: 'PHOTO',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await reconcileUploadAttempts();

    expect(mocks.deleteAsset).not.toHaveBeenCalled();
    const updated = await prisma.uploadAttempt.findUniqueOrThrow({ where: { id: active.id } });
    expect(updated.status).toBe('ACQUIRING');
  });
});
