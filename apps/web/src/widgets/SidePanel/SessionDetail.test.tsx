import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCartStore } from 'entities/Commerce/model/cartStore';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { SessionDetail } from './SessionDetail';

const mocks = vi.hoisted(() => {
  const mediaItem = {
    id: 'media-1',
    type: 'PHOTO' as const,
    lightboxUrl: 'https://example.com/lightbox.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    price: 300,
    capturedAt: new Date('2026-04-01T10:00:00.000Z'),
    spotId: 'spot-1',
    photographerId: 'photographer-1',
    viewerEntitlement: { purchaseState: 'none' as const },
    spot: { id: 'spot-1', name: 'Pipeline' },
  };

  return {
    mediaItem,
  };
});

vi.mock('entities/SurfSession', () => ({
  useSessionMedia: () => ({ data: [mocks.mediaItem], isLoading: false }),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'buyer-1' } }),
}));

vi.mock('entities/Media', () => ({
  useMediaFavorites: () => ({ favoriteIds: new Set(), toggleFavorite: vi.fn() }),
}));

vi.mock('features/PublicGallery', () => ({
  PublicCard: ({ onAction }: { onAction?: (action: 'cart') => void }) => (
    <button type="button" onClick={() => onAction?.('cart')}>Add to cart</button>
  ),
  MediaLightbox: () => null,
}));

vi.mock('shared/ui/BaseGallery', () => ({
  BaseGallery: ({
    items,
    renderCard,
  }: {
    items: Array<{ id: string }>;
    renderCard: (item: { id: string }, context: { index: number }) => ReactNode;
  }) => <>{items.map((item, index) => (
    <div key={item.id}>{renderCard(item, { index })}</div>
  ))}</>,
}));

describe('SessionDetail', () => {
  it('adds media through the Commerce-owned cart mapping', async () => {
    localStorage.clear();
    useCartStore.setState({ items: [] });

    const session = {
      id: 'session-1',
      spotId: 'spot-1',
      photographerId: 'photographer-1',
      startsAt: new Date('2026-04-01T09:00:00.000Z'),
      endsAt: new Date('2026-04-01T11:00:00.000Z'),
      status: 'PUBLISHED' as const,
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
      spot: { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Oahu' },
      photographer: { id: 'photographer-1', name: 'Kai' },
      thumbnailUrl: mocks.mediaItem.thumbnailUrl,
      mediaCount: 1,
    };

    render(
      <MantineProvider>
        <SessionDetail session={session} />
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add to cart' }));

    expect(useCartStore.getState().items).toEqual([{
      id: 'media-1',
      label: 'Pipeline · Apr 1, 2026',
      spotName: 'Pipeline',
      capturedAt: '2026-04-01T10:00:00.000Z',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      lightboxUrl: 'https://example.com/lightbox.jpg',
      priceCents: 300,
    }]);
  });

  it('renders session metadata in the shared panel gallery metadata band', () => {
    const session = {
      id: 'session-1',
      spotId: 'spot-1',
      photographerId: 'photographer-1',
      startsAt: new Date('2026-04-01T09:00:00.000Z'),
      endsAt: new Date('2026-04-01T11:00:00.000Z'),
      status: 'PUBLISHED' as const,
      createdAt: new Date('2026-04-01T12:00:00.000Z'),
      spot: { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Oahu' },
      photographer: { id: 'photographer-1', name: 'Kai' },
      thumbnailUrl: mocks.mediaItem.thumbnailUrl,
      mediaCount: 1,
    };

    render(
      <MantineProvider>
        <PanelLayout>
          <SessionDetail session={session} />
        </PanelLayout>
      </MantineProvider>,
    );

    expect(screen.getByText('Pipeline').closest('[data-panel-gallery-meta]')).not.toBeNull();
  });
});
