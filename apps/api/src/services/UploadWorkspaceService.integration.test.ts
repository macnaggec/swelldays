import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { UploadWorkspaceService } from './UploadWorkspaceService';

const mockCleanup = { deleteStoredAsset: vi.fn().mockResolvedValue(undefined) };
const service = new UploadWorkspaceService(mockCleanup);

async function clearTestData() {
  await prisma.uploadWorkspaceMediaChange.deleteMany();
  await prisma.uploadWorkspaceAsset.deleteMany();
  await prisma.uploadAttempt.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.mediaItem.deleteMany();
  await prisma.uploadWorkspace.deleteMany();
  await prisma.surfSession.deleteMany();
  await prisma.spot.deleteMany();
  await prisma.user.deleteMany();
}

async function seedPublishedSessionWithOnePhoto(options: { purchased?: boolean } = {}) {
  const photographer = await prisma.user.create({
    data: { email: `workspace-${crypto.randomUUID()}@example.com` },
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
      photoPrice: 700,
      videoPrice: 1200,
      status: 'PUBLISHED',
    },
  });
  const original = await prisma.mediaItem.create({
    data: {
      sessionId: session.id,
      photographerId: photographer.id,
      spotId: spot.id,
      type: 'PHOTO',
      status: 'PUBLISHED',
      price: 700,
      capturedAt: new Date('2026-01-01T06:30:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/original.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/original-thumb.jpg',
      cloudinaryPublicId: `swelldays/users/${photographer.id}/original-${crypto.randomUUID()}`,
    },
  });

  if (options.purchased) {
    await prisma.purchase.create({
      data: {
        mediaItemId: original.id,
        amountPaid: 700,
        platformFee: 70,
        photographerEarned: 630,
      },
    });
  }

  return { photographer, spot, session, original };
}

async function addReadyWorkspaceAsset(workspaceId: string, photographerId: string) {
  return prisma.uploadWorkspaceAsset.create({
    data: {
      workspaceId,
      photographerId,
      type: 'PHOTO',
      status: 'READY',
      capturedAt: new Date('2026-01-01T07:00:00Z'),
      lightboxUrl: 'https://res.cloudinary.com/test/replacement.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/test/replacement-thumb.jpg',
      cloudinaryPublicId: `swelldays/users/${photographerId}/replacement-${crypto.randomUUID()}`,
    },
  });
}

beforeEach(async () => {
  await clearTestData();
  mockCleanup.deleteStoredAsset.mockClear();
});
afterAll(async () => {
  await clearTestData();
  await prisma.$disconnect();
});

describe('UploadWorkspaceService session edits', () => {
  it('replaces the only existing session item with a new workspace asset on save', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto();

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);
    const replacement = await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.saveWorkspace(photographer.id, workspace.id);

    expect(await prisma.surfSession.findUnique({ where: { id: session.id } })).toMatchObject({
      status: 'PUBLISHED',
    });
    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toBeNull();
    const liveMedia = await prisma.mediaItem.findMany({
      where: { sessionId: session.id, status: 'PUBLISHED', deletedAt: null },
    });
    expect(liveMedia).toHaveLength(1);
    expect(liveMedia[0]).toMatchObject({
      cloudinaryPublicId: replacement.cloudinaryPublicId,
      price: 700,
      status: 'PUBLISHED',
    });
    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: original.cloudinaryPublicId,
      resourceType: 'PHOTO',
    });
  });

  it('soft-deletes a staged removal that has already been purchased', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto({ purchased: true });

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);
    await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.saveWorkspace(photographer.id, workspace.id);

    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toMatchObject({
      status: 'DELETED',
    });
    // Purchased media is soft-deleted, not removed — the asset must stay in Cloudinary
    // so the buyer's download keeps working.
    expect(mockCleanup.deleteStoredAsset).not.toHaveBeenCalled();
  });

  it('deletes the whole session when an edit removes the last unpurchased media item', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto();

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);

    const result = await service.saveWorkspace(photographer.id, workspace.id);

    expect(result.sessionDeleted).toBe(true);
    expect(await prisma.surfSession.findUnique({ where: { id: session.id } })).toMatchObject({
      status: 'DELETED',
    });
    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toBeNull();
    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: original.cloudinaryPublicId,
      resourceType: 'PHOTO',
    });
  });

  it('deletes the session but soft-deletes the last item if it was already purchased', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto({ purchased: true });

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);

    const result = await service.saveWorkspace(photographer.id, workspace.id);

    expect(result.sessionDeleted).toBe(true);
    expect(await prisma.surfSession.findUnique({ where: { id: session.id } })).toMatchObject({
      status: 'DELETED',
    });
    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toMatchObject({
      status: 'DELETED',
    });
    expect(mockCleanup.deleteStoredAsset).not.toHaveBeenCalled();
  });

  it('keeps the live session visible and unchanged when an edit is opened and cancelled', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto();

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);
    await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.cancelWorkspace(photographer.id, workspace.id);

    expect(await prisma.surfSession.findUnique({ where: { id: session.id } })).toMatchObject({
      status: 'PUBLISHED',
      spotId: session.spotId,
    });
    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toMatchObject({
      status: 'PUBLISHED',
      deletedAt: null,
    });
    expect(await prisma.uploadWorkspaceMediaChange.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it('hard-deletes media after clearing stale staged-removal rows from cancelled workspaces', async () => {
    const { photographer, session, original } = await seedPublishedSessionWithOnePhoto();
    const staleWorkspace = await prisma.uploadWorkspace.create({
      data: {
        photographerId: photographer.id,
        kind: 'SESSION_EDIT',
        status: 'CANCELLED',
        targetSessionId: session.id,
        spotId: session.spotId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        photoPrice: session.photoPrice,
        videoPrice: session.videoPrice,
      },
    });
    await prisma.uploadWorkspaceMediaChange.create({
      data: { workspaceId: staleWorkspace.id, mediaItemId: original.id },
    });

    const workspace = await service.startSessionEdit(photographer.id, session.id);
    await service.stageMediaRemoval(photographer.id, workspace.id, original.id);
    await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.saveWorkspace(photographer.id, workspace.id);

    expect(await prisma.mediaItem.findUnique({ where: { id: original.id } })).toBeNull();
    expect(await prisma.uploadWorkspaceMediaChange.count({ where: { mediaItemId: original.id } })).toBe(0);
  });

  it('uses one active workspace slot for both new uploads and session edits', async () => {
    const { photographer, session } = await seedPublishedSessionWithOnePhoto();

    await service.startNewWorkspace(photographer.id, {});

    await expect(service.startSessionEdit(photographer.id, session.id)).rejects.toThrow(
      'Finish or cancel your active upload before editing a session',
    );
  });
});

describe('UploadWorkspaceService discard actions', () => {
  it('deletes the Cloudinary asset immediately when a workspace asset is discarded', async () => {
    const { photographer } = await seedPublishedSessionWithOnePhoto();
    const workspace = await service.startNewWorkspace(photographer.id, {});
    const asset = await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.deleteWorkspaceAsset(photographer.id, workspace.id, asset.id);

    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: asset.cloudinaryPublicId,
      resourceType: 'PHOTO',
    });
  });

  it('deletes the Cloudinary asset immediately for every ready asset when the workspace is cancelled', async () => {
    const { photographer } = await seedPublishedSessionWithOnePhoto();
    const workspace = await service.startNewWorkspace(photographer.id, {});
    const asset = await addReadyWorkspaceAsset(workspace.id, photographer.id);

    await service.cancelWorkspace(photographer.id, workspace.id);

    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: asset.cloudinaryPublicId,
      resourceType: 'PHOTO',
    });
  });
});

describe('UploadWorkspaceService hasAssets', () => {
  it('is false for a freshly started workspace with only form fields filled in', async () => {
    const { photographer } = await seedPublishedSessionWithOnePhoto();
    const workspace = await service.startNewWorkspace(photographer.id, {});

    await service.updateWorkspace(photographer.id, workspace.id, { photoPrice: 700, videoPrice: 1200 });
    const active = await service.getActiveWorkspace(photographer.id);

    expect(active?.hasAssets).toBe(false);
  });

  it('becomes true once a file has been uploaded into the workspace', async () => {
    const { photographer } = await seedPublishedSessionWithOnePhoto();
    const workspace = await service.startNewWorkspace(photographer.id, {});
    await addReadyWorkspaceAsset(workspace.id, photographer.id);

    const active = await service.getActiveWorkspace(photographer.id);
    const updated = await service.updateWorkspace(photographer.id, workspace.id, { photoPrice: 700, videoPrice: 1200 });

    expect(active?.hasAssets).toBe(true);
    expect(updated.hasAssets).toBe(true);
  });
});

describe('Upload workspace occupancy constraint', () => {
  it('rejects a second active workspace even when it has a different kind', async () => {
    const { photographer, session } = await seedPublishedSessionWithOnePhoto();

    await prisma.uploadWorkspace.create({
      data: {
        photographerId: photographer.id,
        kind: 'NEW_SESSION',
      },
    });

    await expect(prisma.uploadWorkspace.create({
      data: {
        photographerId: photographer.id,
        kind: 'SESSION_EDIT',
        targetSessionId: session.id,
      },
    })).rejects.toThrow();
  });
});
