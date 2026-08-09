import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import PublicGallery from './PublicGallery';
import type { PublicMedia } from 'entities/Media';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import type { CardContext } from 'shared/ui/BaseGallery/BaseGallery';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { PanelSettledWidthContext } from 'shared/ui/DrawerShell/panelSettledWidth';
import { publishDrawerGeometry } from 'shared/ui/DrawerShell/geometry';

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
  availableDates: [] as Date[],
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  isLoading: false,
  measuredWidth: 0,
  columns: 0,
  dense: false,
  scrollToIndex: vi.fn(),
  focusItem: vi.fn(),
  reportFirstVisibleIndex: (_index: number) => { },
}));

const useSpotMediaFeedMock = vi.hoisted(() => vi.fn());

const galleryActions = vi.hoisted(() => ({
  toggleCartItem: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock('entities/Spot', () => ({
  useSpotMediaFeed: useSpotMediaFeedMock,
  useSpotPreview: () => ({ data: { name: 'Pipeline' } }),
}));

vi.mock('entities/Commerce', () => ({
  useCartToggle: () => ({ cartItemIds: new Set(), toggleCartItem: galleryActions.toggleCartItem }),
  useCartStore: (selector: (state: { add: () => void }) => unknown) => selector({ add: vi.fn() }),
  toCartItem: vi.fn(),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ user: { id: 'buyer-1' }, isLoading: false }),
}));

vi.mock('entities/Media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('entities/Media')>()),
  useMediaFavorites: () => ({ favoriteIds: new Set(), toggleFavorite: galleryActions.toggleFavorite }),
}));

vi.mock('shared/ui/VirtualGallery/VirtualGallery', () => ({
  VirtualGallery: React.forwardRef(function VirtualGalleryMock(
    {
      toolbar,
      rows,
      columns,
      dense,
      renderCard,
      renderDivider,
      onFirstVisibleIndexChange,
    }: {
      toolbar?: React.ReactNode;
      rows: GalleryRow<PublicMedia>[];
      columns: number;
      dense?: boolean;
      renderCard: (item: PublicMedia, context: CardContext) => React.ReactNode;
      renderDivider?: (date: Date) => React.ReactNode;
      onFirstVisibleIndexChange?: (index: number) => void;
    },
    ref,
  ) {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: galleryState.scrollToIndex,
      focusItem: galleryState.focusItem,
    }));
    galleryState.reportFirstVisibleIndex = onFirstVisibleIndexChange ?? (() => { });
    galleryState.columns = columns;
    galleryState.dense = dense ?? false;
    let itemIndex = 0;
    return (
      <div data-testid="virtual-gallery">
        {toolbar && <div data-testid="gallery-toolbar">{toolbar}</div>}
        {rows.flatMap((row) => {
          if (row.type === 'divider') {
            return renderDivider
              ? [<React.Fragment key={row.key}>{renderDivider(row.date)}</React.Fragment>]
              : [];
          }
          return row.items.map((item) => {
            const index = itemIndex++;
            return (
              <React.Fragment key={item.id}>
                {renderCard(item, {
                  index,
                  isFirst: index === 0,
                  isLast: index === galleryState.flatItems.length - 1,
                  isSelectionMode: false,
                })}
              </React.Fragment>
            );
          });
        })}
      </div>
    );
  }),
}));

vi.mock('shared/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('shared/hooks')>()),
  useMeasuredWidth: () => [galleryState.measuredWidth, () => { }] as const,
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

describe('PublicGallery', () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    class IntersectionObserverMock implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds: ReadonlyArray<number> = [];

      observe(_target: Element) {
        return undefined;
      }

      unobserve(_target: Element) {
        return undefined;
      }

      disconnect() {
        return undefined;
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    global.IntersectionObserver = IntersectionObserverMock;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    publishDrawerGeometry(null);
    galleryState.flatItems = [mediaItem];
    galleryState.availableDates = [mediaItem.capturedAt];
    galleryState.hasNextPage = false;
    galleryState.isFetchingNextPage = false;
    galleryState.isLoading = false;
    galleryState.measuredWidth = 0;
    useSpotMediaFeedMock.mockImplementation(() => ({
      flatItems: galleryState.flatItems,
      availableDates: galleryState.availableDates,
      isLoading: galleryState.isLoading,
      fetchNextPage: galleryState.fetchNextPage,
      hasNextPage: galleryState.hasNextPage,
      isFetchingNextPage: galleryState.isFetchingNextPage,
      fetchPreviousPage: vi.fn(),
      hasPreviousPage: false,
      isFetchingPreviousPage: false,
    }));
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

  it.each([
    ['bottomSheet' as const],
    ['sideOverlay' as const],
  ])('stays compact — 3 columns, dense cards — on mobile even at half/full snap ("expanded"), at %s', (drawerPresentation) => {
    // 375px: a comfortable-density tile (340px target) would round this down to
    // 1 column if mobile ever reached that density — the bug this test guards.
    galleryState.measuredWidth = 375;

    render(
      <PanelScrollChromeStateProvider value={{ hidden: true, drawerPresentation }}>
        <PublicGallery expanded spotId="spot-1" />
      </PanelScrollChromeStateProvider>,
    );

    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(true);
    expect(screen.queryByTestId('gallery-date-sidebar')).not.toBeInTheDocument();
  });

  it('keeps the wide gallery intact while closing, then switches to compact once motion ends', () => {
    const atDrawer = (destinationWidth: number, transitioning: boolean, expanded: boolean) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning }}>
        <PublicGallery expanded={expanded} spotId="spot-1" />
      </PanelSettledWidthContext.Provider>
    );

    // At rest, expanded (comfortable, 340px tile): 1020 / 340 = 3 columns.
    galleryState.measuredWidth = 1020;
    const { rerender } = render(atDrawer(1020, false, true));
    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(false);
    expect(screen.getByTestId('gallery-date-sidebar')).toBeInTheDocument();

    // Closing clips the existing wide gallery instead of shrinking it before
    // the drawer has moved.
    rerender(atDrawer(340, true, false));
    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(false);
    expect(screen.getByTestId('gallery-date-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-gallery').parentElement).toHaveStyle({ width: '1020px' });

    // A live measurement partway through the sweep must not alter that held layout.
    galleryState.measuredWidth = 700;
    rerender(atDrawer(340, true, false));
    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(false);
    expect(screen.getByTestId('virtual-gallery').parentElement).toHaveStyle({ width: '1020px' });

    // Framer Motion reports completion; only now does Gallery compact once.
    galleryState.measuredWidth = 340;
    rerender(atDrawer(340, false, false));
    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(true);
    expect(screen.queryByTestId('gallery-date-sidebar')).not.toBeInTheDocument();

    // Opening keeps the existing behavior: arrange wide immediately, then let
    // the widening drawer reveal the destination cards.
    rerender(atDrawer(1020, true, true));
    expect(galleryState.columns).toBe(3);
    expect(galleryState.dense).toBe(false);
    expect(screen.getByTestId('gallery-date-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-gallery').parentElement).toHaveStyle({ width: '1020px' });
  });

  it('leaves the virtual gallery canvas untransformed while the drawer moves', () => {
    const atDrawer = (destinationWidth: number, transitioning: boolean, expanded: boolean) => (
      <PanelSettledWidthContext.Provider value={{ destinationWidth, open: true, transitioning }}>
        <PublicGallery expanded={expanded} spotId="spot-1" />
      </PanelSettledWidthContext.Provider>
    );

    galleryState.measuredWidth = 1020;
    const { rerender } = render(atDrawer(1020, false, true));
    const virtualCanvas = screen.getByTestId('virtual-gallery').parentElement as HTMLElement;

    rerender(atDrawer(340, true, false));
    act(() => publishDrawerGeometry(DOMRect.fromRect({ width: 700 })));

    expect(virtualCanvas.style.transform).toBe('');
  });

  it('renders published media without a gallery-local selection toolbar', () => {
    render(<PublicGallery expanded spotId="spot-1" />);

    expect(screen.getByTestId('virtual-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
  });

  it('publishes exactly one mobile active-date control, not a duplicate', () => {
    galleryState.measuredWidth = 420;
    galleryState.flatItems = [
      mediaItem,
      {
        ...mediaItem,
        id: 'media-2',
        capturedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ];

    render(
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'sideOverlay' }}
        >
          <PanelLayout>
            <PublicGallery expanded spotId="spot-1" />
          </PanelLayout>
        </PanelScrollChromeStateProvider>
      </MantineProvider>,
    );

    expect(screen.getAllByRole('button', { name: 'Jump to date' })).toHaveLength(1);
  });

  it.each([
    ['bottom sheet', 'bottomSheet' as const],
    ['short side overlay', 'sideOverlay' as const],
    ['compact persistent desktop', 'persistent' as const],
  ])('shows every matching month the first time the date control opens (%s)', async (_label, drawerPresentation) => {
    galleryState.measuredWidth = 420;
    galleryState.flatItems = [{
      ...mediaItem,
      capturedAt: new Date('2026-07-21T10:00:00.000Z'),
    }];
    galleryState.availableDates = [
      new Date('2026-07-21T10:00:00.000Z'),
      new Date('2026-06-25T10:00:00.000Z'),
    ];

    render(
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation }}
        >
          <PanelLayout>
            <PublicGallery expanded spotId="spot-1" />
          </PanelLayout>
        </PanelScrollChromeStateProvider>
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Jump to date' }));

    expect(screen.getByRole('button', { name: 'Jul' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Jun' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('narrows a persistent desktop panel to the same compact date control as mobile, with no interactive in-grid divider', () => {
    galleryState.measuredWidth = 420;
    galleryState.flatItems = [
      mediaItem,
      {
        ...mediaItem,
        id: 'media-2',
        capturedAt: new Date('2026-03-01T10:00:00.000Z'),
      },
    ];

    render(
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'persistent' }}
        >
          <PanelLayout>
            <PublicGallery expanded spotId="spot-1" />
          </PanelLayout>
        </PanelScrollChromeStateProvider>
      </MantineProvider>,
    );

    // Same one active-date control as mobile, mounted through the shared chrome
    // slot — not the wide rail, and not a second in-grid interactive divider.
    expect(screen.getAllByRole('button', { name: 'Jump to date' })).toHaveLength(1);
    expect(screen.queryByTestId('gallery-date-sidebar')).not.toBeInTheDocument();
  });

  it('jumps directly to an initially unloaded date via a fresh anchored query instead of paging through every intervening page', async () => {
    galleryState.measuredWidth = 420;
    const julyItem = {
      ...mediaItem,
      capturedAt: new Date('2026-07-21T10:00:00.000Z'),
    };
    const juneDate = new Date('2026-06-25T10:00:00.000Z');
    galleryState.flatItems = [julyItem];
    galleryState.availableDates = [julyItem.capturedAt, juneDate];
    galleryState.hasNextPage = true;

    const gallery = () => (
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider
          value={{ hidden: true, drawerPresentation: 'sideOverlay' }}
        >
          <PanelLayout>
            <PublicGallery expanded spotId="spot-1" />
          </PanelLayout>
        </PanelScrollChromeStateProvider>
      </MantineProvider>
    );
    const { rerender } = render(gallery());

    // The fresh anchored query starts out loading, same as any new query key.
    // June has only juneDate loaded; tapping the month only unfolds it locally,
    // then tapping its one day jumps straight to it.
    galleryState.isLoading = true;
    await userEvent.click(screen.getByRole('button', { name: 'Jump to date' }));
    await userEvent.click(screen.getByRole('button', { name: 'Jun' }));
    await userEvent.click(screen.getByRole('button', { name: '25' }));

    expect(useSpotMediaFeedMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ jumpAnchor: juneDate }),
    );
    expect(galleryState.fetchNextPage).not.toHaveBeenCalled();
    expect(galleryState.scrollToIndex).not.toHaveBeenCalled();

    // The anchored page resolves: one request landed exactly on the target day.
    galleryState.isLoading = false;
    galleryState.flatItems = [{ ...mediaItem, id: 'media-june', capturedAt: juneDate }];
    galleryState.availableDates = [julyItem.capturedAt, juneDate];
    galleryState.hasNextPage = true;
    rerender(gallery());

    await waitFor(() => {
      expect(galleryState.scrollToIndex).toHaveBeenCalledWith(0, { align: 'start' });
    });
    expect(galleryState.fetchNextPage).not.toHaveBeenCalled();
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

  it.each([
    ['bottom sheet', 'bottomSheet' as const],
    ['short side overlay', 'sideOverlay' as const],
    ['compact persistent desktop', 'persistent' as const],
  ])(
    'keeps the same keyboard-opened preview and hands focus back by item id across a live shell crossing (%s)',
    async (_label, drawerPresentation) => {
      galleryState.measuredWidth = 420;
      const user = userEvent.setup();
      const gallery = (expanded: boolean) => (
        <MantineProvider env="test">
          <PanelScrollChromeStateProvider value={{ hidden: true, drawerPresentation }}>
            <PublicGallery expanded={expanded} spotId="spot-1" />
          </PanelScrollChromeStateProvider>
        </MantineProvider>
      );
      const { rerender } = render(gallery(false));
      const card = screen.getByRole('button', { name: 'Open Media media-1' });

      card.focus();
      await user.keyboard('{Enter}');

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus());
      const previewImage = screen.getByAltText(/Surf photo from/);
      expect(previewImage).toHaveAttribute('src', mediaItem.lightboxUrl);

      Object.defineProperty(previewImage, 'naturalWidth', { value: 1200, configurable: true });
      Object.defineProperty(previewImage, 'naturalHeight', { value: 800, configurable: true });
      fireEvent.load(previewImage);
      fireEvent.click(screen.getByRole('button', { name: 'Add to favorites' }));

      expect(galleryActions.toggleFavorite).toHaveBeenCalledWith(mediaItem);

      // Simulate a capability-band crossing: a column-count change (driven here by
      // `expanded`, exactly as a real drawer resize drives it via `galleryColumns`)
      // is what causes VirtualGallery's real row keys to change and remount.
      rerender(gallery(true));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByAltText(/Surf photo from/)).toHaveAttribute('src', mediaItem.lightboxUrl);

      fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

      await waitFor(() => expect(galleryState.focusItem).toHaveBeenCalledWith('media-1'));
    },
  );

  it('keeps the current active date anchor through a live shell crossing instead of resetting it', () => {
    galleryState.measuredWidth = 420;
    galleryState.flatItems = [
      mediaItem,
      { ...mediaItem, id: 'media-2', capturedAt: new Date('2026-03-01T10:00:00.000Z') },
    ];
    galleryState.availableDates = [mediaItem.capturedAt, new Date('2026-03-01T10:00:00.000Z')];

    const gallery = (expanded: boolean, drawerPresentation: 'sideOverlay' | 'persistent') => (
      <MantineProvider env="test">
        <PanelScrollChromeStateProvider value={{ hidden: true, drawerPresentation }}>
          <PanelLayout>
            <PublicGallery expanded={expanded} spotId="spot-1" />
          </PanelLayout>
        </PanelScrollChromeStateProvider>
      </MantineProvider>
    );

    const { rerender } = render(gallery(false, 'sideOverlay'));
    const initialAnchor = screen.getByRole('button', { name: 'Jump to date' }).textContent;

    // Row 2 is the older day's divider (row 0: newer-day divider, row 1: its one media
    // row, row 2: older-day divider) — simulating a real scroll deep enough to anchor
    // on the second day, exactly as VirtualGallery's real onFirstVisibleIndexChange
    // would report.
    act(() => galleryState.reportFirstVisibleIndex(2));
    const scrolledAnchor = screen.getByRole('button', { name: 'Jump to date' }).textContent;
    expect(scrolledAnchor).not.toBe(initialAnchor);

    // A shell crossing (band/presentation change) must not reset this back to the top.
    rerender(gallery(true, 'persistent'));

    expect(screen.getByRole('button', { name: 'Jump to date' }).textContent).toBe(scrolledAnchor);
  });
});
