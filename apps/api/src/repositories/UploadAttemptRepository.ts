import { MediaType, UploadAttemptStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { BadRequestError, NotFoundError } from 'server/errors';
import type { UploadAttemptProjection } from '@swelldays/contracts';

export type BeginLocalInput = {
  clientRequestId: string;
  workspaceId: string;
  photographerId: string;
  cloudinaryPublicId: string;
  expectedMediaType: MediaType;
  uploadGrantExpiresAt?: Date;
  expiresAt: Date;
};

export type FinalizeMediaInput = {
  capturedAt: Date;
  thumbnailUrl: string;
  lightboxUrl: string;
  resourceType: MediaType;
  width: number | null;
  height: number | null;
};

const CANCELLABLE_STATUSES: UploadAttemptStatus[] = [
  'READY', 'ACQUIRING', 'FINALIZING', 'FAILED',
];

const RECONCILABLE_STATUSES: UploadAttemptStatus[] = [
  'READY', 'FAILED', 'CANCEL_REQUESTED', 'CLEANUP_PENDING',
];

export interface IUploadAttemptRepository {
  beginLocalIdempotent(input: BeginLocalInput): Promise<UploadAttemptProjection>;
  beginDriveIdempotent(input: BeginLocalInput & { remoteFileId: string }): Promise<UploadAttemptProjection>;
  markAcquiring(attemptId: string, photographerId: string): Promise<void>;
  finalizeIntoWorkspace(attemptId: string, photographerId: string, media: FinalizeMediaInput): Promise<{ id: string; uploadAttemptId: string }>;
  cancelAttempt(attemptId: string, photographerId: string): Promise<void>;
  cancelAttemptsForWorkspace(workspaceId: string, photographerId: string): Promise<void>;
  findByIdForPhotographer(attemptId: string, photographerId: string): Promise<UploadAttemptProjection | null>;
  /** Returns the internal Drive fields needed by processDrive — never exposed to the client. */
  findDriveDetails(attemptId: string, photographerId: string): Promise<{ remoteFileId: string; cloudinaryPublicId: string; expectedMediaType: MediaType } | null>;
  /** Returns the internal fields needed for provider cleanup after cancellation — never exposed to the client. */
  findCleanupDetails(attemptId: string, photographerId: string): Promise<{ cloudinaryPublicId: string; expectedMediaType: MediaType; status: UploadAttemptStatus } | null>;
  listForWorkspace(workspaceId: string, photographerId: string): Promise<UploadAttemptProjection[]>;
  hasBlockingAttempts(workspaceId: string): Promise<boolean>;
  findExpiredForReconciliation(): Promise<Array<{
    id: string;
    cloudinaryPublicId: string;
    expectedMediaType: MediaType;
    status: UploadAttemptStatus;
  }>>;
  markCancelled(attemptId: string): Promise<void>;
}

function toProjection(row: {
  id: string; clientRequestId: string; source: string; status: string;
  cloudinaryPublicId: string; lastErrorCode: string | null; createdAt: Date;
}): UploadAttemptProjection {
  return {
    id: row.id,
    clientRequestId: row.clientRequestId,
    source: row.source as UploadAttemptProjection['source'],
    status: row.status as UploadAttemptProjection['status'],
    cloudinaryPublicId: row.cloudinaryPublicId,
    errorCode: row.lastErrorCode,
    createdAt: row.createdAt,
  };
}

export class UploadAttemptRepository implements IUploadAttemptRepository {
  beginLocalIdempotent(input: BeginLocalInput): Promise<UploadAttemptProjection> {
    return runQuery(async () => {
      const existing = await prisma.uploadAttempt.findUnique({
        where: { photographerId_clientRequestId: { photographerId: input.photographerId, clientRequestId: input.clientRequestId } },
      });
      if (existing) return toProjection(existing);
      return toProjection(await prisma.uploadAttempt.create({
        data: {
          clientRequestId: input.clientRequestId,
          workspaceId: input.workspaceId,
          photographerId: input.photographerId,
          source: 'LOCAL',
          cloudinaryPublicId: input.cloudinaryPublicId,
          expectedMediaType: input.expectedMediaType,
          uploadGrantExpiresAt: input.uploadGrantExpiresAt,
          expiresAt: input.expiresAt,
        },
      }));
    });
  }

  beginDriveIdempotent(input: BeginLocalInput & { remoteFileId: string }): Promise<UploadAttemptProjection> {
    return runQuery(async () => {
      const existing = await prisma.uploadAttempt.findUnique({
        where: { photographerId_clientRequestId: { photographerId: input.photographerId, clientRequestId: input.clientRequestId } },
      });
      if (existing) return toProjection(existing);
      return toProjection(await prisma.uploadAttempt.create({
        data: {
          clientRequestId: input.clientRequestId,
          workspaceId: input.workspaceId,
          photographerId: input.photographerId,
          source: 'DRIVE',
          cloudinaryPublicId: input.cloudinaryPublicId,
          expectedMediaType: input.expectedMediaType,
          remoteFileId: input.remoteFileId,
          expiresAt: input.expiresAt,
        },
      }));
    });
  }

  markAcquiring(attemptId: string, photographerId: string): Promise<void> {
    return runQuery(async () => {
      const result = await prisma.uploadAttempt.updateMany({
        where: { id: attemptId, photographerId, status: 'READY' },
        data: { status: 'ACQUIRING' },
      });
      if (result.count === 0) {
        const attempt = await prisma.uploadAttempt.findUnique({ where: { id: attemptId } });
        if (!attempt || attempt.photographerId !== photographerId) throw new NotFoundError('UploadAttempt');
        if (attempt.status !== 'ACQUIRING') throw new BadRequestError('Attempt cannot be acquired in its current state');
      }
    });
  }

  finalizeIntoWorkspace(attemptId: string, photographerId: string, media: FinalizeMediaInput): Promise<{ id: string; uploadAttemptId: string }> {
    return runQuery(async () => {
      const attempt = await prisma.uploadAttempt.findUnique({ where: { id: attemptId } });
      if (!attempt || attempt.photographerId !== photographerId) throw new NotFoundError('UploadAttempt');
      if (!(['READY', 'ACQUIRING', 'FINALIZING'] as UploadAttemptStatus[]).includes(attempt.status)) {
        throw new BadRequestError('Attempt is not eligible for finalization');
      }

      return prisma.$transaction(async (tx) => {
        const claimed = await tx.uploadAttempt.updateMany({
          where: { id: attemptId, photographerId, status: { in: ['READY', 'ACQUIRING', 'FINALIZING'] } },
          data: { status: 'FINALIZING' },
        });
        if (claimed.count === 0) throw new BadRequestError('Attempt was cancelled or already finalized');

        const asset = await tx.uploadWorkspaceAsset.create({
          data: {
            workspaceId: attempt.workspaceId,
            photographerId: attempt.photographerId,
            cloudinaryPublicId: attempt.cloudinaryPublicId,
            type: media.resourceType,
            thumbnailUrl: media.thumbnailUrl,
            lightboxUrl: media.lightboxUrl,
            width: media.width,
            height: media.height,
            capturedAt: media.capturedAt,
            importSource: attempt.source === 'DRIVE' ? 'GOOGLE_DRIVE' : 'DIRECT',
            remoteFileId: attempt.remoteFileId ?? undefined,
            uploadAttemptId: attemptId,
          },
        });

        await tx.uploadAttempt.update({ where: { id: attemptId }, data: { status: 'COMPLETED' } });
        return { id: asset.id, uploadAttemptId: attemptId };
      });
    });
  }

  cancelAttempt(attemptId: string, photographerId: string): Promise<void> {
    return runQuery(async () => {
      const result = await prisma.uploadAttempt.updateMany({
        where: { id: attemptId, photographerId, status: { in: CANCELLABLE_STATUSES } },
        data: { status: 'CANCEL_REQUESTED' },
      });
      if (result.count === 0) {
        const attempt = await prisma.uploadAttempt.findUnique({ where: { id: attemptId } });
        if (!attempt || attempt.photographerId !== photographerId) throw new NotFoundError('UploadAttempt');
        // Already in CANCEL_REQUESTED, CLEANUP_PENDING, or CANCELLED — idempotent
      }
    });
  }

  cancelAttemptsForWorkspace(workspaceId: string, photographerId: string): Promise<void> {
    return runQuery(async () => {
      await prisma.uploadAttempt.updateMany({
        where: { workspaceId, photographerId, status: { in: CANCELLABLE_STATUSES } },
        data: { status: 'CANCEL_REQUESTED' },
      });
    });
  }

  findByIdForPhotographer(attemptId: string, photographerId: string): Promise<UploadAttemptProjection | null> {
    return runQuery(async () => {
      const row = await prisma.uploadAttempt.findUnique({ where: { id: attemptId } });
      if (!row || row.photographerId !== photographerId) return null;
      return toProjection(row);
    });
  }

  findDriveDetails(attemptId: string, photographerId: string): Promise<{ remoteFileId: string; cloudinaryPublicId: string; expectedMediaType: MediaType } | null> {
    return runQuery(async () => {
      const row = await prisma.uploadAttempt.findUnique({
        where: { id: attemptId },
        select: { photographerId: true, remoteFileId: true, cloudinaryPublicId: true, expectedMediaType: true },
      });
      if (!row || row.photographerId !== photographerId || !row.remoteFileId) return null;
      return { remoteFileId: row.remoteFileId, cloudinaryPublicId: row.cloudinaryPublicId, expectedMediaType: row.expectedMediaType };
    });
  }

  findCleanupDetails(attemptId: string, photographerId: string): Promise<{ cloudinaryPublicId: string; expectedMediaType: MediaType; status: UploadAttemptStatus } | null> {
    return runQuery(async () => {
      const row = await prisma.uploadAttempt.findUnique({
        where: { id: attemptId },
        select: { photographerId: true, cloudinaryPublicId: true, expectedMediaType: true, status: true },
      });
      if (!row || row.photographerId !== photographerId) return null;
      return { cloudinaryPublicId: row.cloudinaryPublicId, expectedMediaType: row.expectedMediaType, status: row.status };
    });
  }

  listForWorkspace(workspaceId: string, photographerId: string): Promise<UploadAttemptProjection[]> {
    return runQuery(async () => {
      const rows = await prisma.uploadAttempt.findMany({
        where: {
          workspaceId,
          photographerId,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'CANCEL_REQUESTED', 'CLEANUP_PENDING'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toProjection);
    });
  }

  hasBlockingAttempts(workspaceId: string): Promise<boolean> {
    return runQuery(async () => {
      const count = await prisma.uploadAttempt.count({
        where: {
          workspaceId,
          status: { in: ['READY', 'ACQUIRING', 'FINALIZING', 'FAILED'] },
        },
      });
      return count > 0;
    });
  }

  findExpiredForReconciliation(): Promise<Array<{
    id: string;
    cloudinaryPublicId: string;
    expectedMediaType: MediaType;
    status: UploadAttemptStatus;
  }>> {
    return runQuery(() =>
      prisma.uploadAttempt.findMany({
        where: {
          status: { in: RECONCILABLE_STATUSES },
          expiresAt: { lt: new Date() },
        },
        select: { id: true, cloudinaryPublicId: true, expectedMediaType: true, status: true },
        take: 100,
      }),
    );
  }

  markCancelled(attemptId: string): Promise<void> {
    return runQuery(async () => {
      await prisma.uploadAttempt.updateMany({
        where: { id: attemptId, status: { in: RECONCILABLE_STATUSES } },
        data: { status: 'CANCELLED' },
      });
    });
  }
}

export const uploadAttemptRepository = new UploadAttemptRepository();
