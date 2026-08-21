import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePublicGalleryActions } from './usePublicGalleryActions';
import type { PublicMedia } from 'entities/Media';

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'buyer-1' }, isLoading: false }),
}));

function mediaItem(overrides: Partial<PublicMedia> & { id: string }): PublicMedia {
  return {
    photographerId: 'photographer-1',
    photographer: { id: 'photographer-1', name: 'Photographer One' },
    type: 'PHOTO',
    spotId: 'spot-1',
    spot: { id: 'spot-1', name: 'Spot One' },
    capturedAt: new Date('2026-04-01T10:00:00.000Z'),
    price: 300,
    lightboxUrl: 'https://example.com/lightbox.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    viewerEntitlement: { purchaseState: 'none' },
    ...overrides,
  };
}

describe('usePublicGalleryActions', () => {
  it('does not expose cart actions for media already purchased by the viewer', () => {
    const { result } = renderHook(() =>
      usePublicGalleryActions({
        cartItemIds: new Set(),
        favoriteItemIds: new Set(['media-1']),
        hasShare: false,
      }),
    );

    const purchasedItem = mediaItem({
      id: 'media-1',
      viewerEntitlement: { purchaseState: 'purchased' },
    });

    expect(result.current.getCardActions(purchasedItem, false)).toEqual({
      actions: ['favorites'],
      activeActions: ['favorites'],
      isOwn: false,
      isPurchased: true,
    });
    expect(result.current.getCartBulkState([purchasedItem])).toEqual({
      actions: [],
      noActionsLabel: 'All selected items are already purchased',
    });
  });
});
