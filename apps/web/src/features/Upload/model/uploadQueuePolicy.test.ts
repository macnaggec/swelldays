import { describe, expect, it } from 'vitest';
import type { DraftMedia } from 'entities/Media';
import type { GalleryCard } from './types';
import { getUploadQueueStatus } from './uploadQueuePolicy';

function mediaItem(id: string): DraftMedia {
  return {
    id,
    sessionId: 'session-1',
    photographerId: 'photographer-1',
    type: 'PHOTO',
    spotId: null,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    price: null,
    lightboxUrl: `https://cdn.example.com/${id}.jpg`,
    thumbnailUrl: `https://cdn.example.com/${id}-thumb.jpg`,
    cloudinaryPublicId: id,
    status: 'DRAFT',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    resource: {
      resourceType: 'image',
      url: `https://cdn.example.com/${id}.jpg`,
      assetId: `asset-${id}`,
    },
  };
}

describe('getUploadQueueStatus', () => {
  it('reports saved draft and completed upload cards as ready items', () => {
    const cards = [
      { kind: 'asset', id: 'draft-1', result: mediaItem('draft-1') },
      { kind: 'existing', id: 'media-1', result: mediaItem('media-1') },
      {
        kind: 'attempt',
        id: 'upload-2',
        source: 'LOCAL' as const,
        status: 'ACQUIRING' as const,
        previewUrl: 'blob:active',
        resourceType: 'image' as const,
        progress: 40,
      },
      {
        kind: 'attempt',
        id: 'upload-3',
        source: 'LOCAL' as const,
        status: 'FAILED' as const,
        previewUrl: 'blob:failed',
        resourceType: 'image' as const,
      },
    ] satisfies GalleryCard[];

    const status = getUploadQueueStatus(cards);

    expect(status.readyItems.map((card) => card.id)).toEqual(['draft-1', 'media-1']);
    expect(status.canContinue).toBe(false);
  });
});
