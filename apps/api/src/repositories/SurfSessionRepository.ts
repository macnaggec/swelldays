import { MediaStatus, SurfSessionStatus } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { BadRequestError } from 'server/errors';
import type { StoredAssetIdentity } from 'server/ports/UploadAssetStorage';
import type { SurfSessionItem, SurfSessionPage } from '@swelldays/contracts';

export interface ISurfSessionRepository {
  listPublished(filter: { spotId?: string; cursor?: string; limit: number; dateFrom?: Date; dateTo?: Date; favoriteUserId?: string }): Promise<SurfSessionPage>;
  findByPhotographer(photographerId: string): Promise<SurfSessionItem[]>;
  findPublishedById(sessionId: string): Promise<SurfSessionItem | null>;
  retire(sessionId: string, photographerId: string): Promise<{ id: string; hardDeletedAssets: StoredAssetIdentity[] }>;
}

type SessionProjectionRow = {
  id: string;
  spotId: string | null;
  photographerId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: SurfSessionStatus;
  createdAt: Date;
  spot: { id: string; name: string; location: string } | null;
  photographer: { id: string; name: string | null } | null;
  mediaItems: Array<{ thumbnailUrl: string }>;
  _count: { mediaItems: number };
};

function toSessionItem(row: SessionProjectionRow): SurfSessionItem | null {
  if (!row.spotId || !row.startsAt || !row.endsAt || !row.spot || !row.photographer) return null;
  return {
    id: row.id,
    spotId: row.spotId,
    photographerId: row.photographerId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    createdAt: row.createdAt,
    spot: row.spot,
    photographer: row.photographer,
    thumbnailUrl: row.mediaItems[0]?.thumbnailUrl ?? null,
    mediaCount: row._count.mediaItems,
  };
}

const sessionProjectionInclude = {
  spot: { select: { id: true, name: true, location: true } },
  photographer: { select: { id: true, name: true } },
  mediaItems: {
    where: { status: MediaStatus.PUBLISHED, deletedAt: null },
    orderBy: { capturedAt: 'asc' },
    take: 1,
    select: { thumbnailUrl: true },
  },
  _count: {
    select: {
      mediaItems: { where: { status: MediaStatus.PUBLISHED, deletedAt: null } },
    },
  },
} as const;

export class SurfSessionRepository implements ISurfSessionRepository {
  listPublished(filter: { spotId?: string; cursor?: string; limit: number; dateFrom?: Date; dateTo?: Date; favoriteUserId?: string }): Promise<SurfSessionPage> {
    return runQuery(async () => {
      const rows = await prisma.surfSession.findMany({
        where: {
          status: SurfSessionStatus.PUBLISHED,
          ...(filter.spotId ? { spotId: filter.spotId } : {}),
          ...(filter.favoriteUserId ? {
            spot: { favoritedBy: { some: { userId: filter.favoriteUserId } } },
          } : {}),
          ...(filter.dateFrom || filter.dateTo ? {
            startsAt: {
              ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
              ...(filter.dateTo ? { lt: filter.dateTo } : {}),
            },
          } : {}),
        },
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
        include: sessionProjectionInclude,
      });

      const hasMore = rows.length > filter.limit;
      const pageRows = hasMore ? rows.slice(0, -1) : rows;
      const items = pageRows.flatMap((row) => {
        const item = toSessionItem(row);
        return item ? [item] : [];
      });

      return {
        items,
        nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
      };
    });
  }

  findByPhotographer(photographerId: string): Promise<SurfSessionItem[]> {
    return runQuery(async () => {
      const rows = await prisma.surfSession.findMany({
        where: { photographerId, status: SurfSessionStatus.PUBLISHED },
        orderBy: { createdAt: 'desc' },
        include: sessionProjectionInclude,
      });

      return rows.flatMap((row) => {
        const item = toSessionItem(row);
        return item ? [item] : [];
      });
    });
  }

  findPublishedById(sessionId: string): Promise<SurfSessionItem | null> {
    return runQuery(async () => {
      const row = await prisma.surfSession.findFirst({
        where: { id: sessionId, status: SurfSessionStatus.PUBLISHED },
        include: sessionProjectionInclude,
      });

      return row ? toSessionItem(row) : null;
    });
  }

  /**
   * Retires a published session: media never purchased is hard-deleted (caller cleans up
   * Cloudinary for the returned identities), media that was purchased is soft-deleted so
   * the buyer's download keeps working.
   */
  retire(sessionId: string, photographerId: string): Promise<{ id: string; hardDeletedAssets: StoredAssetIdentity[] }> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const deletedAt = new Date();

        const liveMedia = await tx.mediaItem.findMany({
          where: { sessionId, photographerId, deletedAt: null },
          include: { purchases: { select: { id: true }, take: 1 } },
        });
        const hardDelete = liveMedia.filter((item) => item.purchases.length === 0);
        const softDeleteIds = liveMedia
          .filter((item) => item.purchases.length > 0)
          .map((item) => item.id);

        if (hardDelete.length > 0) {
          await tx.mediaItem.deleteMany({
            where: { id: { in: hardDelete.map((item) => item.id) } },
          });
        }
        if (softDeleteIds.length > 0) {
          await tx.mediaItem.updateMany({
            where: { id: { in: softDeleteIds } },
            data: { status: MediaStatus.DELETED, deletedAt },
          });
        }

        const sessionUpdate = await tx.surfSession.updateMany({
          where: { id: sessionId, photographerId, status: SurfSessionStatus.PUBLISHED },
          data: { status: SurfSessionStatus.DELETED },
        });
        if (sessionUpdate.count !== 1) {
          throw new BadRequestError('Session is not a removable published session');
        }

        const hardDeletedAssets: StoredAssetIdentity[] = hardDelete.map((item) => ({
          cloudinaryPublicId: item.cloudinaryPublicId,
          resourceType: item.type,
        }));
        return { id: sessionId, hardDeletedAssets };
      }),
    );
  }
}

export const surfSessionRepository = new SurfSessionRepository();
