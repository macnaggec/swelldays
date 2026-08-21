import type {
  IMediaRepository,
  PublishedSpotMediaBeforeFilter,
  PublishedSpotMediaFilter,
  PublishedSpotMediaScope,
} from 'server/repositories/MediaRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { logger } from 'shared/lib/logger';
import { BadRequestError, ForbiddenError, NotFoundError } from 'shared/errors';
import { MEDIA_STATUS, MIN_MEDIA_PRICE_CENTS } from '@wave-atlas/contracts';
import type { MediaStatus, DraftMedia } from '@wave-atlas/contracts';
import type { ICloudinaryService } from './CloudinaryService';
import { cloudinaryService } from './CloudinaryService';
import {
  purchaseEntitlementService,
  type IPurchaseEntitlementService,
} from './PurchaseEntitlementService';
import type { PublicMedia, PublicMediaPage } from '@wave-atlas/contracts';
import type { AttributedPublishedMedia } from 'server/repositories/MediaRepository';

function assertPriceFloor(price: number | null | undefined): void {
  if (price != null && price < MIN_MEDIA_PRICE_CENTS) {
    throw new BadRequestError(`Price must be at least $${(MIN_MEDIA_PRICE_CENTS / 100).toFixed(2)}`);
  }
}

export type UpdateMediaInput = {
  price?: number;
  status?: MediaStatus;
};

export type UpdateBatchInput = {
  price?: number;
  capturedAt?: Date;
  spotId?: string;
};

export class MediaService {
  constructor(
    private media: IMediaRepository,
    private cloudinary: Pick<ICloudinaryService, 'deleteAsset'>,
    private entitlements: Pick<IPurchaseEntitlementService, 'getViewerMediaEntitlements'> = purchaseEntitlementService,
  ) { }

  async updateMedia(userId: string, id: string, data: UpdateMediaInput): Promise<DraftMedia> {
    const media = await this.assertOwns(userId, id);
    if (media.status === MEDIA_STATUS.PUBLISHED) {
      assertPriceFloor(data.price);
    }
    return this.media.updateMedia(id, data);
  }

  async deleteMedia(userId: string, mediaId: string): Promise<void> {
    const media = await this.assertOwns(userId, mediaId);
    if (media.status === MEDIA_STATUS.DRAFT) {
      await this.media.hardDelete(mediaId);
      this.cloudinary.deleteAsset(
        media.cloudinaryPublicId,
        media.resource.resourceType,
      ).catch((err) =>
        logger.error('[MediaService] Failed to clean up Cloudinary asset after unpublished media removal', { publicId: media.cloudinaryPublicId, error: err }),
      );
    } else {
      await this.media.softDelete(mediaId);
    }
  }

  async deleteMediaBatch(userId: string, mediaIds: string[]): Promise<void> {
    const items = await this.fetchOwnedBatch(userId, mediaIds);
    for (const item of items) {
      if (item.status !== MEDIA_STATUS.DRAFT) {
        throw new BadRequestError(`Media ${item.id} is not a draft`);
      }
    }
    const sessionIds = new Set(items.map((item) => item.sessionId));
    if (sessionIds.size !== 1) {
      throw new BadRequestError('Unpublished media must belong to one session');
    }
    await this.media.hardDeleteMany(mediaIds);
    for (const item of items) {
      void this.cloudinary.deleteAsset(
        item.cloudinaryPublicId,
        item.type === 'VIDEO' ? 'video' : 'image',
      ).catch((err) =>
        logger.error('[MediaService] Failed to clean up Cloudinary asset after batch unpublished media removal', { publicId: item.cloudinaryPublicId, error: err }),
      );
    }
  }

  async updateBatch(userId: string, mediaIds: string[], data: UpdateBatchInput): Promise<void> {
    const items = await this.fetchOwnedBatch(userId, mediaIds);
    for (const item of items) {
      if (item.status !== MEDIA_STATUS.DRAFT) {
        throw new BadRequestError(`Media ${item.id} is not a draft`);
      }
    }
    await this.media.updateManyMedia(mediaIds, data);
  }

  async updatePublishedBatch(userId: string, mediaIds: string[], data: UpdateBatchInput): Promise<void> {
    assertPriceFloor(data.price);
    const items = await this.fetchOwnedBatch(userId, mediaIds);
    for (const item of items) {
      if (item.status !== MEDIA_STATUS.PUBLISHED) {
        throw new BadRequestError(`Media ${item.id} is not published`);
      }
    }
    await this.media.updateManyMedia(mediaIds, data);
  }

  async getMyDrafts(userId: string): Promise<DraftMedia[]> {
    return this.media.findDraftsByUser(userId);
  }

  async hasDrafts(userId: string): Promise<boolean> {
    return this.media.hasDraftsByUser(userId);
  }

  findPublishedByPhotographer(photographerId: string) {
    return this.media.findPublishedByPhotographer(photographerId);
  }

  async findPublishedBySession(sessionId: string, viewerId?: string | null): Promise<PublicMedia[]> {
    const items = await this.media.findPublishedBySession(sessionId);
    return this.withViewerEntitlement(items, viewerId);
  }

  async findPublishedBySpot(
    filter: PublishedSpotMediaFilter,
    viewerId?: string | null,
  ): Promise<PublicMediaPage> {
    const page = await this.media.findPublishedBySpot(filter);
    return {
      ...page,
      items: await this.withViewerEntitlement(page.items, viewerId),
    };
  }

  async findPublishedBySpotBefore(
    filter: PublishedSpotMediaBeforeFilter,
    viewerId?: string | null,
  ): Promise<PublicMediaPage> {
    const page = await this.media.findPublishedBySpotBefore(filter);
    return {
      ...page,
      items: await this.withViewerEntitlement(page.items, viewerId),
    };
  }

  findPublishedDates(filter: PublishedSpotMediaScope): Promise<Date[]> {
    return this.media.findPublishedDates(filter);
  }

  /**
   * Fetches all items in a single query, verifies each is owned by `userId`,
   * and returns the lightweight batch records. Replaces N individual findById
   * calls in batch operations.
   */
  private async fetchOwnedBatch(
    userId: string,
    mediaIds: string[],
  ): Promise<{ id: string; sessionId: string; status: string; price: number | null; photographerId: string; cloudinaryPublicId: string; type: string }[]> {
    const items = await this.media.findByIds(mediaIds);

    const found = new Set(items.map((i) => i.id));
    for (const id of mediaIds) {
      if (!found.has(id)) throw new NotFoundError('Media Item');
    }
    for (const item of items) {
      if (item.photographerId !== userId) {
        throw new ForbiddenError('You do not have permission to modify this media');
      }
    }
    return items;
  }

  private async assertOwns(userId: string, mediaId: string): Promise<DraftMedia> {
    const media = await this.media.findById(mediaId);
    if (!media) throw new NotFoundError('Media Item');
    if (media.photographerId !== userId) {
      throw new ForbiddenError('You do not have permission to modify this media');
    }
    return media;
  }

  private async withViewerEntitlement(
    items: AttributedPublishedMedia[],
    viewerId?: string | null,
  ): Promise<PublicMedia[]> {
    const entitlementByMediaId = await this.entitlements.getViewerMediaEntitlements(
      viewerId,
      items.map((item) => item.id),
    );

    return items.map((item) => ({
      ...item,
      viewerEntitlement: entitlementByMediaId.get(item.id) ?? { purchaseState: 'none' },
    }));
  }
}

export const mediaService = new MediaService(mediaRepository, cloudinaryService);
