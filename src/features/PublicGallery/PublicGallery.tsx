import React, { FC, memo, useCallback, useMemo, useRef, useState } from 'react';
import { SimpleGrid, Skeleton } from '@mantine/core';
import { useMediaFavorites, type PublicMedia } from 'entities/Media';
import { useSpotMediaFeed, useSpotPreview } from 'entities/Spot';
import { buildGalleryRows } from 'shared/lib/buildGalleryRows';
import { VirtualGallery, type VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';
import { useCartToggle } from 'entities/Commerce';
import PublicCard, { PublicCardAction } from './ui/cards/PublicCard';
import MediaLightbox from './ui/MediaLightbox';
import { GalleryDateSidebar } from './ui/GalleryDateSidebar';
import { usePublicGalleryActions } from './model/usePublicGalleryActions';
import { usePanelGalleryColumns } from './model/usePanelGalleryColumns';
import { EMPTY_BROWSE_FILTERS, type BrowseFilters } from 'shared/model/browseFilters';
import { PanelScrollChrome } from 'shared/ui/PanelScrollChrome';
import { GalleryEmptyState } from './ui/GalleryEmptyState';

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
  const { flatItems, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useSpotMediaFeed({ spotId, filters });

  const { data: spot } = useSpotPreview(spotId ?? '', { enabled: !!spotId });
  const spotName = spot?.name ?? '';

  const { cartItemIds, toggleCartItem } = useCartToggle(spotName);
  const { favoriteIds, toggleFavorite } = useMediaFavorites();

  const { getCardActions, userId } = usePublicGalleryActions({
    cartItemIds,
    favoriteItemIds: favoriteIds,
    hasShare: !!onShare,
  });

  // Panel width drives column count and card density: compact packs a dense grid
  // with actions moved to the lightbox; expanded keeps the roomy card layout.
  const columns = usePanelGalleryColumns(expanded);

  // ========================================================================
  // LIGHTBOX STATE
  // ========================================================================

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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

  const highlights = useMemo(
    () =>
      rows
        .map((row, i) => (row.type === 'divider' ? { date: row.date, rowIndex: i } : null))
        .filter((h): h is { date: Date; rowIndex: number } => h !== null),
    [rows],
  );

  const galleryRef = useRef<VirtualGalleryHandle>(null);
  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);

  // ========================================================================
  // ACTION HANDLERS
  // ========================================================================

  const handleCardClick = useCallback(
    (itemId: string) => {
      const index = flatItems.findIndex((i) => i.id === itemId);
      if (index !== -1) setLightboxIndex(index);
    },
    [flatItems],
  );

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

  // ========================================================================
  // RENDER
  // ========================================================================

  if (isLoading) {
    return (
      <>
        <PanelScrollChrome />
        <SimpleGrid
          cols={columns}
          spacing="var(--wa-panel-grid-gap)"
          px="var(--wa-panel-content-inset)"
          mt="md"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={120} radius="sm" />
          ))}
        </SimpleGrid>
      </>
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
      <>
        <PanelScrollChrome />
        <GalleryEmptyState
          title={emptyMessage ?? (hasActiveFilters ? 'No shots match this view' : 'No shots here yet')}
          description={description}
          actionLabel={hasActiveFilters ? 'Show all media' : undefined}
          onAction={hasActiveFilters ? onClearFilters : undefined}
        />
      </>
    );
  }

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', gap: 4 }}>
        <VirtualGallery
          ref={galleryRef}
          rows={rows}
          columns={columns}
          dense={!expanded}
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
                dense={!expanded}
              />
            );
          }}
          onFirstVisibleIndexChange={setFirstVisibleIndex}
          onEndReached={hasNextPage ? fetchNextPage : undefined}
          isFetchingMore={isFetchingNextPage}
        />
        {expanded && (
          <GalleryDateSidebar
            highlights={highlights}
            firstVisibleIndex={firstVisibleIndex}
            galleryRef={galleryRef}
          />
        )}
      </div>

      <MediaLightbox
        items={lightboxItems}
        initialIndex={lightboxIndex ?? 0}
        opened={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
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
