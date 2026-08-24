import { MediaType, Prisma, UploadWorkspaceKind, UploadWorkspaceStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { BadRequestError, ForbiddenError, NotFoundError } from 'server/errors';
import { logger } from 'server/lib/logger';
import { cloudinaryService } from './CloudinaryService';
import type { AssetCleanupPort, StoredAssetIdentity } from 'server/ports/UploadAssetStorage';
import type { UploadWorkspaceState, UploadWorkspaceSummary } from '@swelldays/contracts';

type WorkspaceSeed = {
  spotId?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  photoPrice?: number;
  videoPrice?: number;
};

const ATTEMPT_BLOCKING_STATUSES = ['READY', 'ACQUIRING', 'FINALIZING', 'FAILED'] as const;
const ATTEMPT_CANCELLABLE_STATUSES = ['READY', 'ACQUIRING', 'FINALIZING', 'FAILED'] as const;

export class UploadWorkspaceService {
  constructor(private cleanup: AssetCleanupPort) {}

  getActiveWorkspace(photographerId: string): Promise<UploadWorkspaceSummary | null> {
    return runQuery(async () => {
      const workspace = await prisma.uploadWorkspace.findFirst({
        where: { photographerId, status: UploadWorkspaceStatus.ACTIVE },
      });
      return workspace ? toWorkspaceSummary(workspace) : null;
    });
  }

  startNewWorkspace(photographerId: string, seed: WorkspaceSeed) {
    return runQuery(async () => {
      const active = await prisma.uploadWorkspace.findFirst({
        where: { photographerId, status: UploadWorkspaceStatus.ACTIVE },
      });
      if (active) {
        if (active.kind === UploadWorkspaceKind.NEW_SESSION) return active;
        throw new BadRequestError('Finish or cancel your active edit before starting a new upload');
      }

      return prisma.uploadWorkspace.create({
        data: {
          photographerId,
          kind: UploadWorkspaceKind.NEW_SESSION,
          spotId: seed.spotId,
          startsAt: seed.startsAt,
          endsAt: seed.endsAt,
          photoPrice: seed.photoPrice,
          videoPrice: seed.videoPrice,
        },
      });
    });
  }

  startSessionEdit(photographerId: string, sessionId: string) {
    return runQuery(async () => {
      const session = await prisma.surfSession.findFirst({
        where: { id: sessionId, photographerId, status: 'PUBLISHED' },
      });
      if (!session) throw new NotFoundError('Surf Session');

      const active = await prisma.uploadWorkspace.findFirst({
        where: { photographerId, status: UploadWorkspaceStatus.ACTIVE },
      });
      if (active) {
        if (
          active.kind === UploadWorkspaceKind.SESSION_EDIT &&
          active.targetSessionId === sessionId
        ) {
          return active;
        }
        if (active.kind === UploadWorkspaceKind.NEW_SESSION) {
          throw new BadRequestError('Finish or cancel your active upload before editing a session');
        }
        throw new BadRequestError('Finish or cancel your active edit before editing another session');
      }

      return prisma.uploadWorkspace.create({
        data: {
          photographerId,
          kind: UploadWorkspaceKind.SESSION_EDIT,
          targetSessionId: session.id,
          spotId: session.spotId,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          photoPrice: session.photoPrice,
          videoPrice: session.videoPrice,
        },
      });
    });
  }

  async getWorkspaceState(photographerId: string, workspaceId: string): Promise<UploadWorkspaceState> {
    return runQuery(async () => {
      const workspace = await prisma.uploadWorkspace.findFirst({
        where: { id: workspaceId, photographerId, status: UploadWorkspaceStatus.ACTIVE },
        include: {
          assets: { where: { status: 'READY' }, orderBy: { createdAt: 'asc' } },
          mediaChanges: { orderBy: { createdAt: 'asc' } },
          attempts: {
            where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'CANCEL_REQUESTED', 'CLEANUP_PENDING'] } },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!workspace) throw new NotFoundError('Upload Workspace');

      const existingMedia = workspace.kind === UploadWorkspaceKind.SESSION_EDIT && workspace.targetSessionId
        ? await prisma.mediaItem.findMany({
          where: {
            sessionId: workspace.targetSessionId,
            photographerId,
            status: 'PUBLISHED',
            deletedAt: null,
          },
          orderBy: { capturedAt: 'asc' },
        })
        : [];

      return {
        workspace: toWorkspaceSummary(workspace),
        existingMedia: existingMedia.map((media) => ({
          id: media.id,
          type: media.type,
          thumbnailUrl: media.thumbnailUrl,
          lightboxUrl: media.lightboxUrl,
          capturedAt: media.capturedAt,
          price: media.price,
          cloudinaryPublicId: media.cloudinaryPublicId,
          width: media.width,
          height: media.height,
        })),
        assets: workspace.assets.map((asset) => ({
          id: asset.id,
          type: asset.type,
          status: asset.status,
          thumbnailUrl: asset.thumbnailUrl,
          lightboxUrl: asset.lightboxUrl,
          capturedAt: asset.capturedAt,
          cloudinaryPublicId: asset.cloudinaryPublicId,
          uploadAttemptId: asset.uploadAttemptId,
          createdAt: asset.createdAt,
          width: asset.width,
          height: asset.height,
        })),
        stagedRemovalIds: workspace.mediaChanges.map((change) => change.mediaItemId),
        attempts: workspace.attempts.map((attempt) => ({
          id: attempt.id,
          clientRequestId: attempt.clientRequestId,
          source: attempt.source,
          status: attempt.status,
          cloudinaryPublicId: attempt.cloudinaryPublicId,
          errorCode: attempt.lastErrorCode,
          createdAt: attempt.createdAt,
        })),
      };
    });
  }

  async updateWorkspace(
    photographerId: string,
    workspaceId: string,
    changes: Partial<WorkspaceSeed>,
  ): Promise<UploadWorkspaceSummary> {
    return runQuery(async () => {
      await this.findActiveWorkspace(workspaceId, photographerId);
      const workspace = await prisma.uploadWorkspace.update({
        where: { id: workspaceId },
        data: {
          spotId: changes.spotId,
          startsAt: changes.startsAt,
          endsAt: changes.endsAt,
          photoPrice: changes.photoPrice,
          videoPrice: changes.videoPrice,
        },
      });
      return toWorkspaceSummary(workspace);
    });
  }

  async stageMediaRemoval(photographerId: string, workspaceId: string, mediaItemId: string) {
    return runQuery(async () => {
      const workspace = await this.findActiveWorkspace(workspaceId, photographerId);
      if (workspace.kind !== UploadWorkspaceKind.SESSION_EDIT || !workspace.targetSessionId) {
        throw new BadRequestError('Only session edit workspaces can stage media removals');
      }

      const media = await prisma.mediaItem.findFirst({
        where: {
          id: mediaItemId,
          photographerId,
          sessionId: workspace.targetSessionId,
          status: 'PUBLISHED',
          deletedAt: null,
        },
      });
      if (!media) throw new BadRequestError('Media is not part of the editable session');

      return prisma.uploadWorkspaceMediaChange.upsert({
        where: {
          workspaceId_mediaItemId: {
            workspaceId,
            mediaItemId,
          },
        },
        update: {},
        create: { workspaceId, mediaItemId },
      });
    });
  }

  async unstageMediaRemoval(photographerId: string, workspaceId: string, mediaItemId: string) {
    return runQuery(async () => {
      await this.findActiveWorkspace(workspaceId, photographerId);
      await prisma.uploadWorkspaceMediaChange.deleteMany({ where: { workspaceId, mediaItemId } });
    });
  }

  async deleteWorkspaceAsset(photographerId: string, workspaceId: string, assetId: string): Promise<{ id: string }> {
    return runQuery(async () =>
      prisma.$transaction(async (tx) => {
        const workspace = await tx.uploadWorkspace.findFirst({
          where: { id: workspaceId, photographerId, status: UploadWorkspaceStatus.ACTIVE },
          select: { id: true },
        });
        if (!workspace) throw new NotFoundError('Upload Workspace');
        const asset = await tx.uploadWorkspaceAsset.findFirst({
          where: { id: assetId, workspaceId, photographerId, status: 'READY' },
        });
        if (!asset) throw new NotFoundError('Upload Workspace Asset');

        await tx.uploadWorkspaceAsset.update({
          where: { id: assetId },
          data: { status: 'DELETED' },
        });
        if (asset.uploadAttemptId) {
          await tx.uploadAttempt.updateMany({
            where: { id: asset.uploadAttemptId, status: 'COMPLETED' },
            data: { status: 'CLEANUP_PENDING' },
          });
        }
        return { id: assetId };
      }),
    );
  }

  async saveWorkspace(photographerId: string, workspaceId: string): Promise<{ id: string }> {
    const result = await runQuery(async () =>
      prisma.$transaction(async (tx) => {
        const workspace = await tx.uploadWorkspace.findFirst({
          where: { id: workspaceId, photographerId, status: UploadWorkspaceStatus.ACTIVE },
          include: {
            assets: { where: { status: 'READY' }, orderBy: { createdAt: 'asc' } },
            mediaChanges: {
              include: { mediaItem: { include: { purchases: { select: { id: true }, take: 1 } } } },
            },
            attempts: { where: { status: { in: [...ATTEMPT_BLOCKING_STATUSES] } }, select: { id: true } },
          },
        });
        if (!workspace) throw new NotFoundError('Upload Workspace');
        if (workspace.attempts.length > 0) {
          throw new BadRequestError('Cannot save while uploads are still in progress or failed');
        }
        validateWorkspaceFields(workspace);

        if (workspace.kind === UploadWorkspaceKind.NEW_SESSION) {
          if (workspace.assets.length === 0) {
            throw new BadRequestError('Workspace must contain at least one media item');
          }
          const session = await tx.surfSession.create({
            data: {
              photographerId,
              spotId: workspace.spotId,
              startsAt: workspace.startsAt,
              endsAt: workspace.endsAt,
              photoPrice: workspace.photoPrice,
              videoPrice: workspace.videoPrice,
              status: 'PUBLISHED',
            },
          });
          await createPublishedMediaFromAssets(tx, {
            assets: workspace.assets,
            sessionId: session.id,
            photographerId,
            spotId: workspace.spotId!,
            photoPrice: workspace.photoPrice,
            videoPrice: workspace.videoPrice,
          });
          await tx.uploadWorkspaceAsset.updateMany({
            where: { workspaceId, status: 'READY' },
            data: { status: 'PROMOTED' },
          });
          await tx.uploadWorkspace.update({
            where: { id: workspaceId },
            data: { status: UploadWorkspaceStatus.SAVED },
          });
          return { id: session.id, hardDeletedAssets: [] as StoredAssetIdentity[] };
        }

        if (!workspace.targetSessionId) {
          throw new BadRequestError('Session edit workspace is missing its target session');
        }

        const stagedRemovalIds = workspace.mediaChanges.map((change) => change.mediaItemId);
        const keptLiveMediaCount = await tx.mediaItem.count({
          where: {
            sessionId: workspace.targetSessionId,
            photographerId,
            status: 'PUBLISHED',
            deletedAt: null,
            id: { notIn: stagedRemovalIds },
          },
        });
        if (keptLiveMediaCount + workspace.assets.length < 1) {
          throw new BadRequestError('Workspace must contain at least one media item');
        }

        await tx.surfSession.updateMany({
          where: { id: workspace.targetSessionId, photographerId, status: 'PUBLISHED' },
          data: {
            spotId: workspace.spotId,
            startsAt: workspace.startsAt,
            endsAt: workspace.endsAt,
            photoPrice: workspace.photoPrice,
            videoPrice: workspace.videoPrice,
          },
        });

        await tx.uploadWorkspaceMediaChange.deleteMany({ where: { workspaceId } });
        const hardDeleteChanges = workspace.mediaChanges
          .filter((change) => change.mediaItem.purchases.length === 0);
        const hardDeleteIds = hardDeleteChanges.map((change) => change.mediaItemId);
        const hardDeletedAssets: StoredAssetIdentity[] = hardDeleteChanges.map((change) => ({
          cloudinaryPublicId: change.mediaItem.cloudinaryPublicId,
          resourceType: change.mediaItem.type,
        }));
        const softDeleteIds = workspace.mediaChanges
          .filter((change) => change.mediaItem.purchases.length > 0)
          .map((change) => change.mediaItemId);

        if (hardDeleteIds.length > 0) {
          await tx.uploadWorkspaceMediaChange.deleteMany({
            where: { mediaItemId: { in: hardDeleteIds } },
          });
          await tx.mediaItem.deleteMany({
            where: { id: { in: hardDeleteIds }, photographerId, sessionId: workspace.targetSessionId },
          });
        }
        if (softDeleteIds.length > 0) {
          await tx.mediaItem.updateMany({
            where: { id: { in: softDeleteIds }, photographerId, sessionId: workspace.targetSessionId },
            data: { status: 'DELETED', deletedAt: new Date() },
          });
        }

        await createPublishedMediaFromAssets(tx, {
          assets: workspace.assets,
          sessionId: workspace.targetSessionId,
          photographerId,
          spotId: workspace.spotId!,
          photoPrice: workspace.photoPrice,
          videoPrice: workspace.videoPrice,
        });
        await tx.uploadWorkspaceAsset.updateMany({
          where: { workspaceId, status: 'READY' },
          data: { status: 'PROMOTED' },
        });
        await tx.uploadWorkspace.update({
          where: { id: workspaceId },
          data: { status: UploadWorkspaceStatus.SAVED },
        });

        return { id: workspace.targetSessionId, hardDeletedAssets };
      }),
    );

    for (const asset of result.hardDeletedAssets) {
      try {
        await this.cleanup.deleteStoredAsset(asset);
      } catch (err) {
        logger.error('[uploadWorkspace] Cloudinary cleanup failed for removed media', { asset, err });
      }
    }

    return { id: result.id };
  }

  async cancelWorkspace(photographerId: string, workspaceId: string): Promise<{ id: string }> {
    return runQuery(async () =>
      prisma.$transaction(async (tx) => {
        const workspace = await tx.uploadWorkspace.findFirst({
          where: { id: workspaceId, photographerId, status: UploadWorkspaceStatus.ACTIVE },
        });
        if (!workspace) throw new NotFoundError('Upload Workspace');

        await tx.uploadAttempt.updateMany({
          where: { workspaceId, photographerId, status: { in: [...ATTEMPT_CANCELLABLE_STATUSES] } },
          data: { status: 'CANCEL_REQUESTED' },
        });
        await tx.uploadWorkspaceAsset.updateMany({
          where: { workspaceId, status: 'READY' },
          data: { status: 'DELETED' },
        });
        await tx.uploadWorkspaceMediaChange.deleteMany({ where: { workspaceId } });
        await tx.uploadWorkspace.update({
          where: { id: workspaceId },
          data: { status: UploadWorkspaceStatus.CANCELLED },
        });
        return { id: workspaceId };
      }),
    );
  }

  async ensureUploadableWorkspace(photographerId: string, workspaceId: string): Promise<{ id: string }> {
    const workspace = await this.findActiveWorkspace(workspaceId, photographerId);
    return { id: workspace.id };
  }

  private async findActiveWorkspace(workspaceId: string, photographerId: string) {
    const workspace = await prisma.uploadWorkspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundError('Upload Workspace');
    if (workspace.photographerId !== photographerId) {
      throw new ForbiddenError('You do not have permission to use this upload workspace');
    }
    if (workspace.status !== UploadWorkspaceStatus.ACTIVE) {
      throw new BadRequestError('Upload workspace is no longer active');
    }
    return workspace;
  }
}

function toWorkspaceSummary(workspace: {
  id: string;
  kind: UploadWorkspaceKind;
  status: UploadWorkspaceStatus;
  targetSessionId: string | null;
  spotId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  photoPrice: number;
  videoPrice: number;
  createdAt: Date;
  updatedAt: Date;
}): UploadWorkspaceSummary {
  return {
    id: workspace.id,
    kind: workspace.kind,
    status: workspace.status,
    targetSessionId: workspace.targetSessionId,
    spotId: workspace.spotId,
    startsAt: workspace.startsAt,
    endsAt: workspace.endsAt,
    photoPrice: workspace.photoPrice,
    videoPrice: workspace.videoPrice,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

function validateWorkspaceFields(workspace: {
  spotId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  photoPrice: number;
  videoPrice: number;
}) {
  if (!workspace.spotId || !workspace.startsAt || !workspace.endsAt) {
    throw new BadRequestError('Workspace is incomplete');
  }
  if (workspace.startsAt >= workspace.endsAt) {
    throw new BadRequestError('Session end time must be after its start time');
  }
  if (workspace.photoPrice == null || workspace.videoPrice == null) {
    throw new BadRequestError('Workspace is missing prices');
  }
}

async function createPublishedMediaFromAssets(
  tx: Prisma.TransactionClient,
  input: {
    assets: Array<{
      id: string;
      type: MediaType;
      cloudinaryPublicId: string;
      thumbnailUrl: string;
      lightboxUrl: string;
      width: number | null;
      height: number | null;
      capturedAt: Date;
      importSource: 'DIRECT' | 'GOOGLE_DRIVE';
      remoteFileId: string | null;
      uploadAttemptId: string | null;
    }>;
    sessionId: string;
    photographerId: string;
    spotId: string;
    photoPrice: number;
    videoPrice: number;
  },
) {
  for (const asset of input.assets) {
    await tx.mediaItem.create({
      data: {
        sessionId: input.sessionId,
        photographerId: input.photographerId,
        spotId: input.spotId,
        type: asset.type,
        status: 'PUBLISHED',
        price: asset.type === MediaType.VIDEO ? input.videoPrice : input.photoPrice,
        capturedAt: asset.capturedAt,
        lightboxUrl: asset.lightboxUrl,
        thumbnailUrl: asset.thumbnailUrl,
        width: asset.width,
        height: asset.height,
        cloudinaryPublicId: asset.cloudinaryPublicId,
        importSource: asset.importSource,
        remoteFileId: asset.remoteFileId ?? undefined,
        uploadAttemptId: asset.uploadAttemptId ?? undefined,
      },
    });
  }
}

export const uploadWorkspaceService = new UploadWorkspaceService(cloudinaryService);
