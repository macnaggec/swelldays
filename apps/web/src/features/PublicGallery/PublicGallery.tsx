import React, { FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimpleGrid, Skeleton } from '@mantine/core';
import classes from './PublicGallery.module.css';
import { useMediaFavorites, type PublicMedia } from 'entities/Media';
import { useSpotMediaFeed, useSpotPreview } from 'entities/Spot';
import { buildGalleryRows } from 'shared/lib/buildGalleryRows';
import { galleryColumns, type GalleryDensity } from 'shared/lib/galleryColumns';
import { useMeasuredWidth } from 'shared/hooks';
import { useSettledLayout } from 'shared/ui/DrawerShell/panelSettledWidth';
import { VirtualGallery, type VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';
import { useCartToggle } from 'entities/Commerce';
import {
  PanelLayoutRail,
  PanelLayoutStickyChromeReplacement,
} from 'shared/ui/PanelLayout';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import PublicCard, { PublicCardAction } from './ui/cards/PublicCard';
import MediaLightbox from './ui/MediaLightbox';
import { GalleryDateSidebar } from './ui/GalleryDateSidebar';
import { GalleryDateJumpHeading } from './ui/GalleryDateJumpHeading';
import {
  activeDayIndex,
  mergeGalleryDateHighlights,
  showsDateRail,
  type GalleryDateHighlight,
} from './model/galleryDateHighlights';
import { usePublicGalleryActions } from './model/usePublicGalleryActions';
import { EMPTY_BROWSE_FILTERS, type BrowseFilters } from 'shared/model/browseFilters';
import { PanelCollectionEmptyState } from 'shared/ui/PanelCollectionEmptyState';
import { PanelQueryError } from 'shared/ui/PanelQueryError';

const TABLET_SIDE_OVERLAY_MIN_COLUMNS = 2;
const TABLET_SIDE_OVERLAY_MAX_COLUMNS = 4;

export interface PublicGalleryProps {
  expanded: boolean;
  /** Omit to browse published media across all spots instead of a single spot. */
  spotId?: string;
  onShare?: (items: PublicMedia[]) => void;
  emptyMessage?: string;
  filters?: BrowseFilters;
  onClearFilters?: () => void;
}

const PublicGallery: FC<PublicGalleryProps> = memo(({
  expanded,
  spotId,
  onShare,
  emptyMessage,
  filters = EMPTY_BROWSE_FILTERS,
  onClearFilters,
}) => {
  const [jumpAnchor, setJumpAnchor] = useState<Date | null>(null);
  const {
    flatItems,
    dateIndex,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } = useSpotMediaFeed({ spotId, filters, jumpAnchor: jumpAnchor ?? undefined });

  const { data: spot } = useSpotPreview(spotId ?? '', { enabled: !!spotId });
  const spotName = spot?.name ?? '';

  const { cartItemIds, toggleCartItem } = useCartToggle(spotName);
  const { favoriteIds, toggleFavorite } = useMediaFavorites();

  const { getCardActions, userId } = usePublicGalleryActions({
    cartItemIds,
    favoriteItemIds: favoriteIds,
    hasShare: !!onShare,
  });

  const { drawerPresentation, mapExclusive } = usePanelScrollChromeState();
  // mapExclusive distinguishes the short-height mobile/landscape side sheet (no wider
  // layout to grow into — forced compact grid, no rail) from the constrained-regular
  // tablet overlay, which shares this same 'sideOverlay' presentation but has real
  // measurable width (T02): that one measures its own column count and density like
  // the wide panel does, just bounded to the overlay's own narrower share of the screen.
  const isMobileSideOverlay = drawerPresentation === 'sideOverlay' && mapExclusive === true;
  const isTabletSideOverlay = drawerPresentation === 'sideOverlay' && mapExclusive === false;
  const isMobileDrawerPresentation = drawerPresentation === 'bottomSheet' || isMobileSideOverlay;

  // Opening arranges the roomy destination grid immediately so the drawer reveals
  // it. Closing keeps that grid intact while it travels, then compacts once after
  // motion completes. Neither direction follows the live intermediate width.
  const [measuredWidth, galleryViewportRef] = useMeasuredWidth();
  const { boxWidth, contentWidth, transitioning } = useSettledLayout(measuredWidth);
  const holdsExpandedLayout = transitioning && !expanded;
  const layoutExpanded = expanded || holdsExpandedLayout;
  const layoutWidth = holdsExpandedLayout
    ? boxWidth ?? measuredWidth
    : contentWidth ?? measuredWidth;
  // Mobile always renders the same compact tile — icons, size, three-column grid —
  // regardless of the desktop-oriented expanded/comfortable toggle: "expanded" is a
  // wide-panel preference (more breathing room in a panel that shares the screen
  // with the map) that a phone has no wider layout to grow into. On mobile the sheet
  // still tracks expanded/peek for its own snap-driven behavior elsewhere; it just
  // never reaches the gallery's own density decision.
  const isCompactGalleryLayout = isMobileDrawerPresentation || !layoutExpanded;
  const density: GalleryDensity = isCompactGalleryLayout ? 'compact' : 'comfortable';
  // 3 is a guaranteed floor here, not just today's typical result: mobile has no wider
  // layout to grow into the way a desktop window does, so without this the narrowest
  // phones would round down to 2. Desktop's own compact panel already measures wide
  // enough to clear 3 on its own (M06s), so this is a no-op there. The tablet side
  // overlay gets its own [2,4] bound instead (T02): it shares its width with the map
  // beside it, a different constraint than either the mobile floor or wide desktop.
  const maxColumnsOverride = isTabletSideOverlay ? TABLET_SIDE_OVERLAY_MAX_COLUMNS : undefined;
  const minColumnsOverride = isTabletSideOverlay
    ? TABLET_SIDE_OVERLAY_MIN_COLUMNS
    : density === 'compact' ? 3 : undefined;
  const columns = galleryColumns(layoutWidth, density, maxColumnsOverride, minColumnsOverride);

  // The moving drawer edge clips the fixed layout. Transforming the virtual canvas
  // would also scale its off-screen spacer and produce blank bands.

  // ========================================================================
  // LIGHTBOX STATE
  // ========================================================================

  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null);
  const lightboxIndex = lightboxItemId === null ? -1 : flatItems.findIndex((i) => i.id === lightboxItemId);

  const lightboxItems = useMemo(
    () => flatItems.map((i) => ({ ...i, type: i.type === 'VIDEO' ? 'video' as const : 'image' as const })),
    [flatItems],
  );

  const ownedItemIds = useMemo(
    () => new Set(flatItems.filter((i) => i.photographerId === userId).map((i) => i.id)),
    [flatItems, userId],
  );
  const purchasedItemIds = useMemo(
    () => new Set(flatItems.filter((i) => i.viewerEntitlement.purchaseState === 'purchased').map((i) => i.id)),
    [flatItems],
  );

  // ========================================================================
  // VIRTUAL ROWS + SIDEBAR
  // ========================================================================

  const rows = useMemo(() => buildGalleryRows(flatItems, columns), [flatItems, columns]);

  const loadedHighlights = useMemo(
    () =>
      rows
        .map((row, i) => (row.type === 'divider' ? { date: row.date, rowIndex: i } : null))
        .filter((h): h is { date: Date; rowIndex: number } => h !== null),
    [rows],
  );

  const galleryRef = useRef<VirtualGalleryHandle>(null);
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);

  // Container-aware date navigation (F12g/M03-h): a wide-enough gallery gets
  // the pinned date rail; every other case — mobile drawers always, or a
  // desktop panel simply narrowed below that width — shares the same compact
  // date control instead of a second, forked one. It follows the same held layout
  // as the cards, so it leaves only when a close has finished.
  //
  // Held in state, not derived fresh each render: the rail is itself part of what
  // showsDateRail measures (it occupies real width inside the same gallery box), so
  // a plain re-derivation would oscillate right at the boundary. showsDateRail owns
  // the hysteresis; this only remembers which side it last settled on.
  const [railVisible, setRailVisible] = useState(
    () => !isMobileDrawerPresentation && showsDateRail(layoutWidth, false),
  );
  const nextRailVisible = !isMobileDrawerPresentation && showsDateRail(layoutWidth, railVisible);
  if (nextRailVisible !== railVisible) {
    setRailVisible(nextRailVisible);
  }
  const usesCompactDateChrome = !railVisible;
  const dayHighlights = useMemo(
    () => mergeGalleryDateHighlights(dateIndex.availableDates, loadedHighlights),
    [dateIndex.availableDates, loadedHighlights],
  );
  const activeDay = dayHighlights[activeDayIndex(dayHighlights, firstVisibleIndex)];
  const [pendingScrollAnchor, setPendingScrollAnchor] = useState<Date | null>(null);
  const handleDateJump = useCallback(
    (day: GalleryDateHighlight) => {
      if (day.rowIndex !== null) {
        galleryRef.current?.scrollToIndex(day.rowIndex, { align: 'start' });
        return;
      }
      // Not yet loaded: reseed the feed to start at this day directly (one
      // request) instead of walking every intervening page to reach it.
      setJumpAnchor(day.date);
      setPendingScrollAnchor(day.date);
    },
    [],
  );
  useEffect(() => {
    if (!pendingScrollAnchor) return;
    if (isLoading) return;
    galleryRef.current?.scrollToIndex(0, { align: 'start' });
    setPendingScrollAnchor(null);
  }, [pendingScrollAnchor, isLoading]);

  // ========================================================================
  // ACTION HANDLERS
  // ========================================================================

  const handleCardClick = useCallback((itemId: string) => {
    setLightboxItemId(itemId);
  }, []);

  const handleCardAction = useCallback(
    (action: PublicCardAction, itemId: string) => {
      const item = flatItems.find((i) => i.id === itemId);
      if (!item) return;
      if (action === 'cart') toggleCartItem(item);
      if (action === 'favorites') toggleFavorite(item);
      if (action === 'share') onShare?.([item]);
    },
    [flatItems, toggleCartItem, toggleFavorite, onShare],
  );

  const handleLightboxFavoriteToggle = useCallback(
    (lightboxItem: { id: string }) => {
      const item = flatItems.find((candidate) => candidate.id === lightboxItem.id);
      if (item) toggleFavorite(item);
    },
    [flatItems, toggleFavorite],
  );

  const closeLightbox = useCallback(() => {
    const closingId = lightboxItemId;
    setLightboxItemId(null);
    if (closingId) galleryRef.current?.focusItem(closingId);
  }, [lightboxItemId]);

  // ========================================================================
  // RENDER
  // ========================================================================

  if (isLoading) {
    // Uses the same `columns` the real VirtualGallery grid below will render at this width/
    // density, and mirrors PublicCard/BaseCard's aspect-ratio (via the padding-bottom trick,
    // Skeleton has no native aspect-ratio support) so the placeholder doesn't change shape
    // once real tiles mount.
    return (
      <SimpleGrid
        cols={columns}
        spacing="var(--wa-panel-grid-gap)"
        px="var(--wa-panel-content-inset)"
        mt="md"
      >
        {Array.from({ length: columns * 2 }).map((_, i) => (
          <Skeleton key={i} height={0} className={classes.skeletonTile} />
        ))}
      </SimpleGrid>
    );
  }

  if (isError) {
    return (
      <PanelQueryError
        title="Couldn't load the gallery"
        description="Something went wrong loading these photos. Try again."
        onRetry={refetch}
      />
    );
  }

  if (flatItems.length === 0) {
    const hasDateFilter = filters.date !== null;
    const hasActiveFilters = hasDateFilter || filters.favoriteSpotsOnly;
    const description = hasDateFilter && filters.favoriteSpotsOnly
      ? 'Try another date or turn off Favorites to widen the gallery.'
      : hasDateFilter
        ? 'Try another date to widen the gallery.'
        : filters.favoriteSpotsOnly
          ? 'Turn off Favorites to widen the gallery.'
          : 'Published photos and clips will show up here. Use Upload above to add the first set.';

    return (
      <PanelCollectionEmptyState
        title={emptyMessage ?? (hasActiveFilters ? 'No shots match this view' : 'No shots here yet')}
        description={description}
        actionLabel={hasActiveFilters ? 'Show all media' : undefined}
        onAction={hasActiveFilters ? onClearFilters : undefined}
      />
    );
  }

  return (
    <>
      {usesCompactDateChrome && (
        <PanelLayoutStickyChromeReplacement>
          <GalleryDateJumpHeading
            date={activeDay?.date ?? null}
            dayHighlights={dayHighlights}
            onJump={handleDateJump}
            isLoading={dateIndex.isLoading}
            isError={dateIndex.isError}
            onRetry={dateIndex.refetch}
          />
        </PanelLayoutStickyChromeReplacement>
      )}
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex' }}>
        <div
          ref={galleryViewportRef}
          style={{
            flex: boxWidth === null ? 1 : '0 0 auto',
            width: boxWidth === null ? undefined : `${boxWidth}px`,
            minWidth: 0,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div
            style={{
              flex: transitioning ? '0 0 auto' : 1,
              width: transitioning ? `${layoutWidth}px` : undefined,
              minWidth: 0,
              display: 'flex',
            }}
          >
            <VirtualGallery
              ref={galleryRef}
              rows={rows}
              columns={columns}
              dense={isCompactGalleryLayout}
              renderCard={(item) => {
                const { actions, activeActions, isOwn } = getCardActions(item, false);
                const isPurchased = item.viewerEntitlement.purchaseState === 'purchased';
                return (
                  <PublicCard
                    mediaItem={item}
                    actions={actions}
                    activeActions={activeActions}
                    onAction={handleCardAction}
                    onCardClick={() => handleCardClick(item.id)}
                    showOwnerBadge={isOwn}
                    showPurchasedBadge={isPurchased}
                    dense={isCompactGalleryLayout}
                  />
                );
              }}
              onFirstVisibleIndexChange={setFirstVisibleIndex}
              onEndReached={hasNextPage ? fetchNextPage : undefined}
              isFetchingMore={isFetchingNextPage}
              onStartReached={hasPreviousPage ? fetchPreviousPage : undefined}
              isFetchingPrevious={isFetchingPreviousPage}
            />
          </div>
        </div>
        {railVisible && (
          <PanelLayoutRail>
            <GalleryDateSidebar
              highlights={dayHighlights}
              firstVisibleIndex={firstVisibleIndex}
              galleryRef={galleryRef}
              onJump={handleDateJump}
              isLoading={dateIndex.isLoading}
              isError={dateIndex.isError}
              onRetry={dateIndex.refetch}
            />
          </PanelLayoutRail>
        )}
      </div>

      <MediaLightbox
        items={lightboxItems}
        initialIndex={lightboxIndex === -1 ? 0 : lightboxIndex}
        opened={lightboxItemId !== null}
        onClose={closeLightbox}
        returnFocus={false}
        cartItemIds={cartItemIds}
        onCartToggle={toggleCartItem}
        favoriteItemIds={favoriteIds}
        onFavoriteToggle={handleLightboxFavoriteToggle}
        ownedItemIds={ownedItemIds}
        purchasedItemIds={purchasedItemIds}
      />
    </>
  );
});

PublicGallery.displayName = 'PublicGallery';

export default PublicGallery;
