import { FC, memo } from 'react';
import { ActionIcon, Group, Text, Badge, Tooltip } from '@mantine/core';
import { IconHeart, IconShoppingCartPlus, IconShoppingCartMinus } from '@tabler/icons-react';
import { formatPrice } from 'shared/lib/currency';
import { formatDimensions } from 'shared/lib/formatDimensions';
import { formatCapturedAtDate } from 'shared/lib/dateUtils';
import { CarouselLightbox } from 'shared/ui/CarouselLightbox';

/** Normalized shape callers must produce before passing to MediaLightbox. */
export interface LightboxMedia {
  id: string;
  lightboxUrl: string;
  thumbnailUrl: string;
  type: 'image' | 'video';
  price: number | null;
  capturedAt: Date;
  photographerId: string;
  width?: number | null;
  height?: number | null;
}

export interface MediaLightboxProps {
  items: LightboxMedia[];
  initialIndex: number;
  opened: boolean;
  onClose: () => void;
  cartItemIds?: Set<string>;
  onCartToggle?: (item: LightboxMedia) => void;
  favoriteItemIds?: Set<string>;
  onFavoriteToggle?: (item: LightboxMedia) => void;
  ownedItemIds?: Set<string>;
  purchasedItemIds?: Set<string>;
  returnFocus?: boolean;
}

/**
 * MediaLightbox - Full-size watermarked preview modal.
 * Caption above the image: price + date on the left. Floating actions: cart and favorite buttons.
 */
const MediaLightbox: FC<MediaLightboxProps> = memo(({
  items,
  initialIndex,
  opened,
  onClose,
  cartItemIds = new Set<string>(),
  onCartToggle,
  favoriteItemIds = new Set<string>(),
  onFavoriteToggle,
  ownedItemIds = new Set<string>(),
  purchasedItemIds = new Set<string>(),
  returnFocus,
}) => {
  const lightboxItems = items.map((item) => ({
    id: item.id,
    url: item.lightboxUrl,
    type: item.type,
    posterUrl: item.type === 'video' ? item.thumbnailUrl : undefined,
    alt: `Surf photo from ${formatCapturedAtDate(item.capturedAt)}`,
    width: item.width,
    height: item.height,
  }));

  return (
    <CarouselLightbox
      items={lightboxItems}
      initialIndex={initialIndex}
      opened={opened}
      onClose={onClose}
      returnFocus={returnFocus}
      renderOverlay={(itemIndex, { mediaReady }) => {
        const item = items[itemIndex];
        if (!item) return null;
        const isPurchased = purchasedItemIds.has(item.id);
        // Price/dimensions describe the media file itself — hold them until mediaReady confirms
        // it actually loaded, rather than showing them optimistically and retracting on failure
        // (that retraction is a visible flash). Date and purchased status are unconditional:
        // they're server data that identifies the item regardless of whether it renders.
        const dimensions = mediaReady ? formatDimensions(item.width, item.height) : null;

        return (
          <Group gap="xs" wrap="wrap">
            {mediaReady && (
              <Badge
                size="lg"
                variant={(item.price ?? 0) > 0 ? 'filled' : 'light'}
                color={(item.price ?? 0) > 0 ? 'blue' : 'gray'}
              >
                {formatPrice(item.price ?? 0)}
              </Badge>
            )}
            <Text size="sm" c="white" fw={600}>
              {formatCapturedAtDate(item.capturedAt)}
            </Text>
            {dimensions && (
              <Text size="sm" c="white" style={{ opacity: 0.75 }}>
                {dimensions}
              </Text>
            )}
            {isPurchased && (
              <Badge size="lg" variant="filled" color="teal">
                Purchased
              </Badge>
            )}
          </Group>
        );
      }}
      renderActions={(currentIndex, { mediaReady }) => {
        const item = items[currentIndex];
        if (!item) return null;
        const isOwn = ownedItemIds.has(item.id);
        const isPurchased = purchasedItemIds.has(item.id);
        const isInCart = cartItemIds.has(item.id);
        const cartLabel = isInCart ? 'Remove from cart' : 'Add to cart';
        const isFavorite = favoriteItemIds.has(item.id);
        const favoriteLabel = isFavorite ? 'Remove from favorites' : 'Add to favorites';
        // Cart/favorites invite purchase behavior that doesn't apply until the media is
        // confirmed viewable — both wait for mediaReady, same reasoning as the overlay above.
        const canAddToCart = mediaReady && (item.price ?? 0) > 0 && !isOwn && !isPurchased && !!onCartToggle;
        const canFavorite = mediaReady && !!onFavoriteToggle;

        if (!canAddToCart && !canFavorite) return null;

        return (
          <>
            {canAddToCart && (
              <Tooltip label={cartLabel} withArrow withinPortal zIndex={4000}>
                <ActionIcon
                  aria-label={cartLabel}
                  data-lightbox-icon-action="true"
                  data-lightbox-icon-frame="chip"
                  data-lightbox-tooltip-layer="above-media"
                  variant="subtle"
                  size={44}
                  radius="xl"
                  onClick={() => onCartToggle!(item)}
                >
                  {isInCart
                    ? <IconShoppingCartMinus size={24} stroke={2} />
                    : <IconShoppingCartPlus size={24} stroke={2} />
                  }
                </ActionIcon>
              </Tooltip>
            )}
            {canFavorite && (
              <Tooltip label={favoriteLabel} withArrow withinPortal zIndex={4000}>
                <ActionIcon
                  aria-label={favoriteLabel}
                  data-lightbox-icon-action="true"
                  data-lightbox-icon-frame="chip"
                  data-lightbox-tooltip-layer="above-media"
                  variant="subtle"
                  color={isFavorite ? 'red' : undefined}
                  size={44}
                  radius="xl"
                  onClick={() => onFavoriteToggle!(item)}
                >
                  <IconHeart size={24} stroke={2} fill={isFavorite ? 'currentColor' : 'none'} />
                </ActionIcon>
              </Tooltip>
            )}
          </>
        );
      }}
    />
  );
});

MediaLightbox.displayName = 'MediaLightbox';

export default MediaLightbox;
