import type { Cents } from './coordinates';
import type { MediaResourceType, MediaStatus } from '../constants/media';

export type { MediaResourceType, MediaStatus } from '../constants/media';

/** Mirrors Prisma MediaType enum without importing Prisma. */
export type MediaType = 'PHOTO' | 'VIDEO';

export type ViewerPurchaseState = 'none' | 'purchased';

export interface ViewerMediaEntitlement {
  purchaseState: ViewerPurchaseState;
}

/** Fields every media projection shares. Price and spot are null until publish. */
export interface MediaCore {
  id: string;
  photographerId: string;
  type: MediaType;
  capturedAt: Date;
  /** Price in cents (e.g. 300 = $3.00). Null on drafts; set at publish time. */
  price: Cents | null;
  /** Null on drafts; set at publish time. */
  spotId: string | null;
  lightboxUrl: string;
  thumbnailUrl: string;
  /** Original (source) media dimensions in px. Null on rows uploaded before capture existed. */
  width?: number | null;
  height?: number | null;
}

/**
 * Photographer-owned record: drafts and own-media management. The only
 * projection that carries internal fields (storage id, upload resource)
 * because the photographer's browser genuinely needs them.
 */
export interface DraftMedia extends MediaCore {
  sessionId: string;
  status: MediaStatus;
  createdAt: Date;
  dateSource?: 'exif' | 'fallback';
  cloudinaryPublicId: string;
  resource: {
    resourceType: MediaResourceType;
    url: string;
    playbackUrl?: string;
    assetId: string;
  };
}

/** Publishing is the type-level event: price and spot become non-null. */
export interface PublishedMedia extends MediaCore {
  price: Cents;
  spotId: string;
  spot: { id: string; name: string } | null;
}

/**
 * What crosses the wire to public viewers: published minus internal fields,
 * plus attribution and the viewer's purchase entitlement.
 */
export interface PublicMedia extends PublishedMedia {
  photographer: { id: string; name: string | null } | null;
  viewerEntitlement: ViewerMediaEntitlement;
}

export type PublicMediaPage = {
  items: PublicMedia[];
  nextCursor: string | null;
  prevCursor: string | null;
};
