import React, { FC, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimpleGrid, Skeleton } from '@mantine/core';
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
import { GalleryEmptyState } from './ui/GalleryEmptyState';

/** Neutral placeholder count for the loading skeleton, rendered before the gallery is mounted and measured. */
const LOADING_SKELETON_COLUMNS = 3;

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
    availableDates,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    fetchPreviousPage,
    hasPreviousPage,
    isFetchingPreviousPage,
  } =
    useSpotMediaFeed({ spotId, filters, jumpAnchor: jumpAnchor ?? undefined });

  const { data: spot } = useSpotPreview(spotId ?? '', { enabled: !!spotId });
  const spotName = spot?.name ?? '';

  const { cartItemIds, toggleCartItem } = useCartToggle(spotName);
  const { favoriteIds, toggleFavorite } = useMediaFavorites();

  const { getCardActions, userId } = usePublicGalleryActions({
    cartItemIds,
    favoriteItemIds: favoriteIds,
    hasShare: !!onShare,
  });

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
  const density: GalleryDensity = layoutExpanded ? 'comfortable' : 'compact';
  const columns = galleryColumns(layoutWidth, density);

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
  const { drawerPresentation } = usePanelScrollChromeState();
  // The mobile drawer presentations never show the wide rail regardless of
  // measured width — a docked sidebar doesn't fit their touch-first, narrow
  // form factor even on the rare occasion the drawer itself measures wide.
  const isMobileDrawerPresentation = drawerPresentation === 'bottomSheet'
    || drawerPresentation === 'sideOverlay';

  // Container-aware date navigation (F12g/M03-h): a wide-enough gallery gets
  // the pinned date rail; every other case — mobile drawers always, or a
  // desktop panel simply narrowed below that width — shares the same compact
  // date control instead of a second, forked one. It follows the same held layout
  // as the cards, so it leaves only when a close has finished.
  const railVisible = !isMobileDrawerPresentation && showsDateRail(layoutWidth);
  const usesCompactDateChrome = !railVisible;
  const dayHighlights = useMemo(
    () => mergeGalleryDateHighlights(availableDates, loadedHighlights),
    [availableDates, loadedHighlights],
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
  const renderNoDivider = useCallback(() => null, []);

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
    return (
      <SimpleGrid
        cols={LOADING_SKELETON_COLUMNS}
        spacing="var(--wa-panel-grid-gap)"
        px="var(--wa-panel-content-inset)"
        mt="md"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={120} radius="sm" />
        ))}
      </SimpleGrid>
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
      <GalleryEmptyState
        title={emptyMessage ?? (hasActiveFilters ? 'No shots match this view' : 'No shots here yet')}
        description={description}
        actionLabel={hasActiveFilters ? 'Show all media' : undefined}
        onAction={hasActiveFilters ? onClearFilters : undefined}
      />
    );
  }

  return (
    <>
      {usesCompactDateChrome && activeDay && (
        <PanelLayoutStickyChromeReplacement>
          <GalleryDateJumpHeading
            date={activeDay.date}
            dayHighlights={dayHighlights}
            onJump={handleDateJump}
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
              dense={!layoutExpanded}
              renderDivider={isMobileDrawerPresentation ? renderNoDivider : undefined}
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
                    dense={!layoutExpanded}
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
