import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import PublicGallery from './PublicGallery';
import type { PublicMedia } from 'entities/Media';

const mediaItem: PublicMedia = {
  id: 'media-1',
  photographerId: 'photographer-1',
  photographer: { id: 'photographer-1', name: 'Photographer One' },
  type: 'PHOTO',
  spotId: 'spot-1',
  spot: { id: 'spot-1', name: 'Pipeline' },
  capturedAt: new Date('2026-04-01T10:00:00.000Z'),
  price: 300,
  lightboxUrl: 'https://example.com/lightbox.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  viewerEntitlement: { purchaseState: 'none' },
};

const galleryState = vi.hoisted(() => ({
  flatItems: [] as PublicMedia[],
  measuredWidth: 0,
}));

vi.mock('entities/Spot', () => ({
  useSpotMediaFeed: () => ({
    flatItems: galleryState.flatItems,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useSpotPreview: () => ({ data: { name: 'Pipeline' } }),
}));

vi.mock('entities/Commerce', () => ({
  useCartToggle: () => ({ cartItemIds: new Set(), toggleCartItem: vi.fn() }),
  useCartStore: (selector: (state: { add: () => void }) => unknown) => selector({ add: vi.fn() }),
  toCartItem: vi.fn(),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'buyer-1' }, isLoading: false }),
}));

vi.mock('entities/Media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('entities/Media')>()),
  useMediaFavorites: () => ({ favoriteIds: new Set(), toggleFavorite: vi.fn() }),
}));

vi.mock('shared/ui/VirtualGallery/VirtualGallery', () => ({
  VirtualGallery: React.forwardRef(function VirtualGalleryMock(
    { toolbar }: { toolbar?: React.ReactNode },
    _ref,
  ) {
    return (
      <div data-testid="virtual-gallery">
        {toolbar && <div data-testid="gallery-toolbar">{toolbar}</div>}
      </div>
    );
  }),
}));

vi.mock('shared/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('shared/hooks')>()),
  useMeasuredWidth: () => [galleryState.measuredWidth, () => {}] as const,
}));

vi.mock('./ui/GalleryDateSidebar', () => ({
  GalleryDateSidebar: () => <div data-testid="gallery-date-sidebar" />,
}));

// The rail portal needs a PanelLayout ancestor; render its children in place so
// the width-gating contract stays observable without mounting the whole panel.
vi.mock('shared/ui/PanelLayout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('shared/ui/PanelLayout')>()),
  PanelLayoutRail: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('./ui/MediaLightbox', () => ({
  default: () => null,
}));

describe('PublicGallery', () => {
  beforeEach(() => {
    galleryState.flatItems = [mediaItem];
    galleryState.measuredWidth = 0;
  });

  it('shows the date rail when the measured gallery width supports it', () => {
    galleryState.measuredWidth = 900;

    render(<PublicGallery expanded spotId="spot-1" />);

    expect(screen.getByTestId('gallery-date-sidebar')).toBeInTheDocument();
  });

  it('hides the date rail below the width capability instead of stealing gallery width', () => {
    galleryState.measuredWidth = 420;

    render(<PublicGallery expanded spotId="spot-1" />);

    expect(screen.queryByTestId('gallery-date-sidebar')).not.toBeInTheDocument();
  });

  it('renders published media without a gallery-local selection toolbar', () => {
    render(<PublicGallery expanded spotId="spot-1" />);

    expect(screen.getByTestId('virtual-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('offers to clear active filters when no media matches the current view', () => {
    galleryState.flatItems = [];
    const onClearFilters = vi.fn();

    render(
      <PublicGallery
        expanded
        filters={{ date: { date: new Date('2026-07-01T00:00:00.000Z') }, favoriteSpotsOnly: false }}
        onClearFilters={onClearFilters}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No shots match this view' })).toBeInTheDocument();
    expect(screen.getByText('Try another date to widen the gallery.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all media' }));

    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('guides an unfiltered empty gallery toward the existing upload action', () => {
    galleryState.flatItems = [];

    render(<PublicGallery expanded />);

    expect(screen.getByRole('heading', { name: 'No shots here yet' })).toBeInTheDocument();
    expect(
      screen.getByText('Published photos and clips will show up here. Use Upload above to add the first set.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all media' })).not.toBeInTheDocument();
  });
});
