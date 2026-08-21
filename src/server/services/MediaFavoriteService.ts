import type { IMediaRepository } from 'server/repositories/MediaRepository';
import { mediaRepository } from 'server/repositories/MediaRepository';
import type { IMediaFavoriteRepository } from 'server/repositories/MediaFavoriteRepository';
import { mediaFavoriteRepository } from 'server/repositories/MediaFavoriteRepository';
import { purchaseEntitlementService, type IPurchaseEntitlementService } from './PurchaseEntitlementService';
import { BadRequestError, NotFoundError } from 'server/errors';

export class MediaFavoriteService {
  constructor(
    private media: Pick<IMediaRepository, 'findById'> = mediaRepository,
    private favorites: IMediaFavoriteRepository = mediaFavoriteRepository,
    private entitlements: Pick<IPurchaseEntitlementService, 'getViewerMediaEntitlements'> = purchaseEntitlementService,
  ) {}

  getFavoriteIds(userId: string) {
    return this.favorites.findIdsByUser(userId);
  }

  async getFavorites(userId: string) {
    const items = await this.favorites.findByUser(userId);
    const entitlements = await this.entitlements.getViewerMediaEntitlements(userId, items.map((item) => item.id));
    return items.map((item) => ({
      ...item,
      viewerEntitlement: entitlements.get(item.id) ?? { purchaseState: 'none' as const },
    }));
  }

  async setFavorite(userId: string, mediaItemId: string, favorited: boolean) {
    if (!favorited) {
      await this.favorites.remove(userId, mediaItemId);
      return { favorited: false };
    }

    const item = await this.media.findById(mediaItemId);
    if (!item) throw new NotFoundError('Media Item');
    if (item.status !== 'PUBLISHED') throw new BadRequestError('Only published media can be favorited');

    await this.favorites.add(userId, mediaItemId);
    return { favorited: true };
  }
}

export const mediaFavoriteService = new MediaFavoriteService();
