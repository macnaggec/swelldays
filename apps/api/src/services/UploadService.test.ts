import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UploadService, type UploadWorkspaceVerifier } from './UploadService';
import type { IUploadAttemptRepository } from 'server/repositories/UploadAttemptRepository';
import type { DirectUploadPort, RemoteImportPort, AssetCleanupPort } from 'server/ports/UploadAssetStorage';
import { randomUUID } from 'node:crypto';
import { ForbiddenError } from 'server/errors';

const mockRepo: IUploadAttemptRepository = {
  beginLocalIdempotent: vi.fn(),
  beginDriveIdempotent: vi.fn(),
  markAcquiring: vi.fn(),
  finalizeIntoWorkspace: vi.fn(),
  cancelAttempt: vi.fn(),
  cancelAttemptsForWorkspace: vi.fn(),
  findByIdForPhotographer: vi.fn(),
  findDriveDetails: vi.fn(),
  findCleanupDetails: vi.fn(),
  listForWorkspace: vi.fn(),
  hasBlockingAttempts: vi.fn(),
  findExpiredForReconciliation: vi.fn(),
  markCancelled: vi.fn(),
};

const mockDirect: DirectUploadPort = {
  createUploadGrant: vi.fn(),
  verifyUploadReceipt: vi.fn(),
};

const mockImport: RemoteImportPort = {
  importRemoteFile: vi.fn(),
};

const mockCleanup: AssetCleanupPort = {
  deleteStoredAsset: vi.fn(),
};

const mockWorkspaces: UploadWorkspaceVerifier = {
  ensureUploadableWorkspace: vi.fn(),
};

const service = new UploadService(mockRepo, mockDirect, mockImport, mockCleanup, mockWorkspaces);

const photographerId = randomUUID();
const workspaceId = randomUUID();
const attemptId = randomUUID();

beforeEach(() => vi.clearAllMocks());

describe('beginLocal', () => {
  it('verifies active workspace ownership before creating an attempt', async () => {
    vi.mocked(mockWorkspaces.ensureUploadableWorkspace).mockRejectedValue(new ForbiddenError('Nope'));

    await expect(
      service.beginLocal(photographerId, { workspaceId, clientRequestId: randomUUID(), declaredMimeType: 'image/jpeg', declaredByteSize: 1024 }),
    ).rejects.toThrow(ForbiddenError);

    expect(mockRepo.beginLocalIdempotent).not.toHaveBeenCalled();
  });

  it('returns a DirectUploadGrant with the attemptId filled in', async () => {
    const attempt = { id: attemptId, cloudinaryPublicId: 'test/abc', clientRequestId: 'r1', source: 'LOCAL', status: 'READY', errorCode: null, createdAt: new Date() } as never;
    const grant = { attemptId: '', cloudinaryPublicId: 'test/abc', signature: 'sig', timestamp: 1, cloudName: 'c', apiKey: 'k', type: 'authenticated', eager: 'e', expiresAt: new Date() } as never;

    vi.mocked(mockWorkspaces.ensureUploadableWorkspace).mockResolvedValue({ id: workspaceId });
    vi.mocked(mockRepo.beginLocalIdempotent).mockResolvedValue(attempt);
    vi.mocked(mockDirect.createUploadGrant).mockReturnValue(grant);

    const result = await service.beginLocal(photographerId, {
      workspaceId, clientRequestId: 'r1', declaredMimeType: 'image/jpeg', declaredByteSize: 1024,
    });

    expect(mockRepo.beginLocalIdempotent).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, photographerId }));
    expect(result.attemptId).toBe(attemptId);
  });
});

describe('beginDrive', () => {
  it('verifies active workspace ownership before creating an attempt', async () => {
    vi.mocked(mockWorkspaces.ensureUploadableWorkspace).mockRejectedValue(new ForbiddenError('Nope'));

    await expect(
      service.beginDrive(photographerId, { workspaceId, clientRequestId: randomUUID(), remoteFileId: 'drive-1', declaredMimeType: 'image/jpeg' }),
    ).rejects.toThrow(ForbiddenError);

    expect(mockRepo.beginDriveIdempotent).not.toHaveBeenCalled();
  });

  it('returns the attemptId once the attempt is created', async () => {
    const attempt = { id: attemptId, cloudinaryPublicId: 'test/abc', clientRequestId: 'r1', source: 'DRIVE', status: 'READY', errorCode: null, createdAt: new Date() } as never;

    vi.mocked(mockWorkspaces.ensureUploadableWorkspace).mockResolvedValue({ id: workspaceId });
    vi.mocked(mockRepo.beginDriveIdempotent).mockResolvedValue(attempt);

    const result = await service.beginDrive(photographerId, {
      workspaceId, clientRequestId: 'r1', remoteFileId: 'drive-1', declaredMimeType: 'image/jpeg',
    });

    expect(mockRepo.beginDriveIdempotent).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, photographerId }));
    expect(result.attemptId).toBe(attemptId);
  });
});

describe('finalizeLocal', () => {
  it('finalizes a verified provider receipt into a workspace asset', async () => {
    vi.mocked(mockRepo.findByIdForPhotographer).mockResolvedValue({
      id: attemptId,
      photographerId,
      cloudinaryPublicId: 'test/abc',
      status: 'READY',
      source: 'LOCAL',
      errorCode: null,
      createdAt: new Date(),
      clientRequestId: 'r1',
    } as never);
    vi.mocked(mockDirect.verifyUploadReceipt).mockResolvedValue({
      cloudinaryPublicId: 'test/abc',
      resourceType: 'PHOTO',
      thumbnailUrl: 'thumb',
      lightboxUrl: 'full',
      width: 1920,
      height: 1080,
    });
    vi.mocked(mockRepo.finalizeIntoWorkspace).mockResolvedValue({ id: 'asset-1', uploadAttemptId: attemptId });

    await expect(
      service.finalizeLocal(photographerId, { attemptId, providerReceipt: { ok: true } }),
    ).resolves.toEqual({ assetId: 'asset-1' });
  });
});

describe('processDrive', () => {
  it('deletes the late asset and does not finalize when attempt is CANCEL_REQUESTED', async () => {
    const attempt = { id: attemptId, photographerId, cloudinaryPublicId: 'test/abc', status: 'CANCEL_REQUESTED', source: 'DRIVE', errorCode: null, createdAt: new Date(), clientRequestId: 'r1' } as never;
    vi.mocked(mockRepo.markAcquiring).mockResolvedValue();
    vi.mocked(mockRepo.findDriveDetails).mockResolvedValue({
      remoteFileId: 'drive-file-1',
      cloudinaryPublicId: 'test/abc',
      expectedMediaType: 'PHOTO',
    });
    vi.mocked(mockImport.importRemoteFile).mockResolvedValue({ cloudinaryPublicId: 'test/abc', resourceType: 'PHOTO', thumbnailUrl: 't', lightboxUrl: 'l', width: 1920, height: 1080 });
    vi.mocked(mockRepo.findByIdForPhotographer).mockResolvedValue(attempt);

    await service.processDrive(photographerId, { attemptId, accessToken: 'token' });

    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({ cloudinaryPublicId: 'test/abc', resourceType: 'PHOTO' });
    expect(mockRepo.finalizeIntoWorkspace).not.toHaveBeenCalled();
  });

  it('cancels the attempt and preserves the provider error when import fails', async () => {
    const providerError = new Error('provider down');
    vi.mocked(mockRepo.markAcquiring).mockResolvedValue();
    vi.mocked(mockRepo.findDriveDetails).mockResolvedValue({
      remoteFileId: 'drive-file-1',
      cloudinaryPublicId: 'test/abc',
      expectedMediaType: 'PHOTO',
    });
    vi.mocked(mockImport.importRemoteFile).mockRejectedValue(providerError);
    vi.mocked(mockRepo.cancelAttempt).mockResolvedValue();

    await expect(
      service.processDrive(photographerId, { attemptId, accessToken: 'token' }),
    ).rejects.toBe(providerError);

    expect(mockRepo.cancelAttempt).toHaveBeenCalledWith(attemptId, photographerId);
    expect(mockRepo.finalizeIntoWorkspace).not.toHaveBeenCalled();
  });
});

describe('discardAttempt', () => {
  it('keeps attempt cancellation successful when provider cleanup fails', async () => {
    vi.mocked(mockRepo.cancelAttempt).mockResolvedValue();
    vi.mocked(mockRepo.findCleanupDetails).mockResolvedValue({
      cloudinaryPublicId: 'test/photo',
      expectedMediaType: 'PHOTO',
      status: 'CANCEL_REQUESTED',
    } as never);
    vi.mocked(mockCleanup.deleteStoredAsset).mockRejectedValue(new Error('provider down'));

    await expect(service.discardAttempt(photographerId, attemptId)).resolves.toBeUndefined();

    expect(mockRepo.cancelAttempt).toHaveBeenCalledWith(attemptId, photographerId);
    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: 'test/photo',
      resourceType: 'PHOTO',
    });
  });

  it('deletes a discarded video with the correct resource type', async () => {
    vi.mocked(mockRepo.cancelAttempt).mockResolvedValue();
    vi.mocked(mockRepo.findCleanupDetails).mockResolvedValue({
      cloudinaryPublicId: 'test/video',
      expectedMediaType: 'VIDEO',
      status: 'CANCEL_REQUESTED',
    } as never);
    vi.mocked(mockCleanup.deleteStoredAsset).mockResolvedValue(undefined);

    await service.discardAttempt(photographerId, attemptId);

    expect(mockCleanup.deleteStoredAsset).toHaveBeenCalledWith({
      cloudinaryPublicId: 'test/video',
      resourceType: 'VIDEO',
    });
  });
});
