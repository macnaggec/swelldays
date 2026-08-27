import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Center, Skeleton, Text } from '@mantine/core';
import { useUser } from 'shared/hooks/useUser';
import { BaseGallery } from 'shared/ui/BaseGallery';
import { PanelCollectionGrid } from 'shared/ui/PanelCollectionGrid';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { useCartToggle } from 'entities/Commerce';
import { useMediaFavorites } from 'entities/Media';
import { MediaLightbox, PublicCard } from 'features/PublicGallery';
import { useCollectionsContext } from './_panel.me.collections';

export const Route = createFileRoute('/_panel/me/collections/favorites')({ component: FavoritesTab });

function FavoritesTab() {
  const { user } = useUser();
  const { favorites, visibleFavorites, isLoadingFavorites } = useCollectionsContext();
  const { toggleFavorite } = useMediaFavorites();
  const { cartItemIds, toggleCartItem } = useCartToggle('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const ownedItemIds = useMemo(() => new Set(favorites.filter((item) => item.photographerId === user?.id).map((item) => item.id)), [favorites, user?.id]);
  const purchasedItemIds = useMemo(() => new Set(favorites.filter((item) => item.viewerEntitlement.purchaseState === 'purchased').map((item) => item.id)), [favorites]);
  const lightboxItems = useMemo(() => visibleFavorites.map((item) => ({ ...item, type: item.type === 'VIDEO' ? 'video' as const : 'image' as const })), [visibleFavorites]);

  if (isLoadingFavorites) {
    // Same grid PanelCollectionGrid gives BaseGallery below, so the column count matches
    // once real cards load; each tile mirrors PublicCard/BaseCard's aspect-ratio: 16/10.
    return (
      <PanelGalleryLayout>
        <PanelCollectionGrid preview>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} height={0} style={{ aspectRatio: '16 / 10', borderRadius: 'var(--wa-radius-control-md)' }} />
          ))}
        </PanelCollectionGrid>
      </PanelGalleryLayout>
    );
  }
  if (favorites.length === 0) return <PanelGalleryLayout><Center mih={200}><Text c="dimmed" size="sm">Your favorites will appear here.</Text></Center></PanelGalleryLayout>;

  return (
    <>
      <PanelGalleryLayout>
        <BaseGallery
          items={visibleFavorites}
          aria-label="Favorites"
          renderCard={(item, { index }) => {
            const isOwn = ownedItemIds.has(item.id);
            const isPurchased = purchasedItemIds.has(item.id);
            return (
              <PublicCard
                mediaItem={item}
                actions={!isOwn && !isPurchased && item.price > 0 ? ['cart', 'favorites'] : ['favorites']}
                activeActions={[...(cartItemIds.has(item.id) ? ['cart' as const] : []), 'favorites']}
                onAction={(action) => action === 'cart' ? toggleCartItem(item) : toggleFavorite(item)}
                onCardClick={() => setLightboxIndex(index)}
                showOwnerBadge={isOwn}
                showPurchasedBadge={isPurchased}
              />
            );
          }}
        />
      </PanelGalleryLayout>
      <MediaLightbox
        items={lightboxItems}
        initialIndex={lightboxIndex ?? 0}
        opened={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        cartItemIds={cartItemIds}
        onCartToggle={toggleCartItem}
        favoriteItemIds={new Set(favorites.map((item) => item.id))}
        onFavoriteToggle={(lightboxItem) => {
          const item = favorites.find((candidate) => candidate.id === lightboxItem.id);
          if (item) toggleFavorite(item);
        }}
        ownedItemIds={ownedItemIds}
        purchasedItemIds={purchasedItemIds}
      />
    </>
  );
}
