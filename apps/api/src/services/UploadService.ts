import { randomUUID } from 'node:crypto';
import { MediaType } from '@prisma/client';
import { NotFoundError } from 'server/errors';
import { logger } from 'server/lib/logger';
import type { IUploadAttemptRepository } from 'server/repositories/UploadAttemptRepository';
import type { DirectUploadPort, RemoteImportPort, AssetCleanupPort } from 'server/ports/UploadAssetStorage';
import type { DirectUploadGrant, UploadAttemptProjection } from '@swelldays/contracts';

const GRANT_TTL_MS   = 60 * 60 * 1000;          // 1 hour
const ATTEMPT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function mimeToMediaType(mime: string): MediaType {
  return mime.startsWith('video/') ? 'VIDEO' : 'PHOTO';
}

export type UploadWorkspaceVerifier = {
  ensureUploadableWorkspace(photographerId: string, workspaceId: string): Promise<{ id: string }>;
};

export class UploadService {
  constructor(
    private repo: IUploadAttemptRepository,
    private direct: DirectUploadPort,
    private remote: RemoteImportPort,
    private cleanup: AssetCleanupPort,
    private workspaces: UploadWorkspaceVerifier,
  ) {}

  async beginLocal(
    photographerId: string,
    input: { workspaceId: string; clientRequestId: string; declaredMimeType: string; declaredByteSize: number },
  ): Promise<DirectUploadGrant> {
    logger.info('[upload] beginLocal', { photographerId, workspaceId: input.workspaceId, clientRequestId: input.clientRequestId });
    await this.workspaces.ensureUploadableWorkspace(photographerId, input.workspaceId);

    const expectedMediaType = mimeToMediaType(input.declaredMimeType);
    const cloudinaryPublicId = `swelldays/users/${photographerId}/${randomUUID()}`;
    const uploadGrantExpiresAt = new Date(Date.now() + GRANT_TTL_MS);
    const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);

    const attempt = await this.repo.beginLocalIdempotent({
      clientRequestId: input.clientRequestId,
      workspaceId: input.workspaceId,
      photographerId,
      cloudinaryPublicId,
      expectedMediaType,
      uploadGrantExpiresAt,
      expiresAt,
    });

    const grant = this.direct.createUploadGrant(
      { cloudinaryPublicId: attempt.cloudinaryPublicId, expectedMediaType, photographerId },
      uploadGrantExpiresAt,
    );
    return { ...grant, attemptId: attempt.id };
  }

  async finalizeLocal(
    photographerId: string,
    input: { attemptId: string; providerReceipt: unknown; capturedAt?: Date },
  ): Promise<{ assetId: string }> {
    logger.info('[upload] finalizeLocal', { photographerId, attemptId: input.attemptId });
    try {
      const attempt = await this.repo.findByIdForPhotographer(input.attemptId, photographerId);
      if (!attempt) throw new NotFoundError('UploadAttempt');

      const asset = await this.direct.verifyUploadReceipt(input.providerReceipt, {
        cloudinaryPublicId: attempt.cloudinaryPublicId,
        expectedMediaType: 'PHOTO',
        photographerId,
      });

      const assetRow = await this.repo.finalizeIntoWorkspace(input.attemptId, photographerId, {
        capturedAt: input.capturedAt ?? new Date(),
        thumbnailUrl: asset.thumbnailUrl,
        lightboxUrl: asset.lightboxUrl,
        resourceType: asset.resourceType,
        width: asset.width,
        height: asset.height,
      });

      logger.info('[upload] finalizeLocal success', { photographerId, attemptId: input.attemptId, assetId: assetRow.id });
      return { assetId: assetRow.id };
    } catch (err) {
      logger.error('[upload] finalizeLocal failed', { photographerId, attemptId: input.attemptId, err });
      throw err;
    }
  }

  async beginDrive(
    photographerId: string,
    input: { workspaceId: string; clientRequestId: string; remoteFileId: string; declaredMimeType: string },
  ): Promise<{ attemptId: string }> {
    logger.info('[upload] beginDrive', { photographerId, workspaceId: input.workspaceId, clientRequestId: input.clientRequestId });
    await this.workspaces.ensureUploadableWorkspace(photographerId, input.workspaceId);

    const expectedMediaType = mimeToMediaType(input.declaredMimeType);
    const cloudinaryPublicId = `swelldays/users/${photographerId}/${randomUUID()}`;

    const attempt = await this.repo.beginDriveIdempotent({
      clientRequestId: input.clientRequestId,
      workspaceId: input.workspaceId,
      photographerId,
      cloudinaryPublicId,
      expectedMediaType,
      remoteFileId: input.remoteFileId,
      uploadGrantExpiresAt: new Date(Date.now() + GRANT_TTL_MS),
      expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
    });

    return { attemptId: attempt.id };
  }

  async processDrive(
    photographerId: string,
    input: { attemptId: string; accessToken: string },
  ): Promise<void> {
    logger.info('[upload] processDrive start', { photographerId, attemptId: input.attemptId });
    await this.repo.markAcquiring(input.attemptId, photographerId);

    const driveDetails = await this.repo.findDriveDetails(input.attemptId, photographerId);
    if (!driveDetails) throw new NotFoundError('UploadAttempt');

    let asset;
    try {
      asset = await this.remote.importRemoteFile({
        sourceUrl: `https://www.googleapis.com/drive/v3/files/${driveDetails.remoteFileId}?alt=media`,
        authHeaders: { Authorization: `Bearer ${input.accessToken}` },
        target: { cloudinaryPublicId: driveDetails.cloudinaryPublicId, expectedMediaType: driveDetails.expectedMediaType, photographerId },
      });
    } catch (err) {
      logger.error('[upload] processDrive — Cloudinary import failed', { attemptId: input.attemptId, err });
      await this.repo.cancelAttempt(input.attemptId, photographerId);
      throw err;
    }

    // Re-read to check for cancellation that arrived during import.
    const current = await this.repo.findByIdForPhotographer(input.attemptId, photographerId);
    if (current?.status === 'CANCEL_REQUESTED') {
      await this.cleanup.deleteStoredAsset({ cloudinaryPublicId: asset.cloudinaryPublicId, resourceType: asset.resourceType });
      return;
    }

    await this.repo.finalizeIntoWorkspace(input.attemptId, photographerId, {
      capturedAt: new Date(),
      thumbnailUrl: asset.thumbnailUrl,
      lightboxUrl: asset.lightboxUrl,
      resourceType: asset.resourceType,
      width: asset.width,
      height: asset.height,
    });
    logger.info('[upload] processDrive success', { attemptId: input.attemptId });
  }

  listForWorkspace(photographerId: string, workspaceId: string): Promise<UploadAttemptProjection[]> {
    return this.repo.listForWorkspace(workspaceId, photographerId);
  }

  async discardAttempt(photographerId: string, attemptId: string): Promise<void> {
    logger.info('[upload] discardAttempt', { photographerId, attemptId });
    await this.repo.cancelAttempt(attemptId, photographerId);
    // Best-effort provider cleanup for asset that was already uploaded.
    const attempt = await this.repo.findCleanupDetails(attemptId, photographerId);
    if (attempt?.status === 'CANCEL_REQUESTED' && attempt.cloudinaryPublicId) {
      void this.cleanup.deleteStoredAsset({ cloudinaryPublicId: attempt.cloudinaryPublicId, resourceType: attempt.expectedMediaType })
        .catch((err) => logger.warn('[upload] discardAttempt — provider cleanup failed (reconciler will retry)', { attemptId, err }));
    }
  }
}

import { uploadAttemptRepository } from 'server/repositories/UploadAttemptRepository';
import { cloudinaryService } from './CloudinaryService';
import { uploadWorkspaceService } from './UploadWorkspaceService';

export const uploadService = new UploadService(
  uploadAttemptRepository,
  cloudinaryService,
  cloudinaryService,
  cloudinaryService,
  uploadWorkspaceService,
);
