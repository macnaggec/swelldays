import { MediaItem as PrismaMediaItem, MediaType } from '@prisma/client';
import { MEDIA_RESOURCE_TYPE } from '@swelldays/contracts/core';
import type { DraftMedia } from '@swelldays/contracts/core';

export function mapToDraftMedia(row: PrismaMediaItem): DraftMedia {
  return {
    id: row.id,
    sessionId: row.sessionId,
    photographerId: row.photographerId,
    type: row.type,
    spotId: row.spotId ?? null,
    capturedAt: row.capturedAt,
    price: row.price ?? null,
    lightboxUrl: row.lightboxUrl,
    thumbnailUrl: row.thumbnailUrl,
    cloudinaryPublicId: row.cloudinaryPublicId,
    width: row.width,
    height: row.height,
    status: row.status,
    createdAt: row.createdAt,
    resource: {
      resourceType: row.type === MediaType.VIDEO
        ? MEDIA_RESOURCE_TYPE.VIDEO
        : MEDIA_RESOURCE_TYPE.IMAGE,
      url: row.lightboxUrl,
      assetId: row.id,
    },
  };
}
