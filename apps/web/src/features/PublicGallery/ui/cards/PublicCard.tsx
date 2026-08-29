

import React, { FC, memo, useCallback, useState } from 'react';
import { ActionIcon, Badge, Group, Text } from '@mantine/core';
import { IconShoppingCartPlus, IconShoppingCartMinus, IconShoppingCart, IconShoppingBag, IconHeart, IconShare, IconFlag, IconUser } from '@tabler/icons-react';
import { formatPrice } from 'shared/lib/currency';
import { formatDimensions } from 'shared/lib/formatDimensions';
import { formatCapturedAtDate } from 'shared/lib/dateUtils';
import { materialClasses } from 'shared/ui/design-system';
import { BaseCard } from 'shared/ui/BaseGallery';
import type { PublicCardAction } from '../../model/types';

export type { PublicCardAction };

/** Minimal display contract for PublicCard — only fields the card actually renders. */
export interface DisplayMedia {
  id: string;
  thumbnailUrl: string;
  price: number | null;
  capturedAt: Date;
  width?: number | null;
  height?: number | null;
  type: 'PHOTO' | 'VIDEO';
}

/**
 * Props for PublicCard component
 */
export interface PublicCardProps {
  /** Media item to display */
  mediaItem: DisplayMedia;

  /** Actions to display (cart, favorites, share, report) */
  actions?: PublicCardAction[];

  /** Actions that are currently active/toggled on */
  activeActions?: PublicCardAction[];

  /** Callback when an action is triggered */
  onAction?: (action: PublicCardAction, id: string) => void;

  /** Callback when card is clicked to open lightbox */
  onCardClick?: (id: string) => void;

  /** Show owner badge overlay (e.g. in selection mode when item belongs to viewer) */
  showOwnerBadge?: boolean;

  /** Show purchased badge overlay when the viewer already owns this media */
  showPurchasedBadge?: boolean;

  /**
   * Dense layout for the compact panel grid: replaces the interactive action
   * buttons with passive cart/favorite state glyphs (the tile opens the lightbox
   * on tap, where the actions live) and drops the per-card date, which the day
   * divider already labels.
   */
  dense?: boolean;
}

/**
 * Action icon configuration — default (inactive) state
 */
const ACTION_ICONS: Record<
  PublicCardAction,
  { icon: typeof IconShoppingCartPlus; label: string; color: string; variant: string }
> = {
  cart: {
    icon: IconShoppingCartPlus,
    label: 'Add to cart',
    color: 'green',
    variant: 'filled'
  },
  favorites: {
    icon: IconHeart,
    label: 'Add to favorites',
    color: 'red',
    variant: 'filled'
  },
  share: {
    icon: IconShare,
    label: 'Share',
    color: 'gray',
    variant: 'filled'
  },
  report: {
    icon: IconFlag,
    label: 'Report',
    color: 'orange',
    variant: 'filled'
  },
};

/**
 * Action icon configuration — active (toggled on) state
 */
const ACTION_ICONS_ACTIVE: Partial<Record<
  PublicCardAction,
  { icon: typeof IconShoppingCartPlus; label: string; color: string; variant: string }
>> = {
  cart: { icon: IconShoppingCartMinus, label: 'Remove from cart', color: 'red', variant: 'filled' },
  favorites: { icon: IconHeart, label: 'Remove from favorites', color: 'red', variant: 'filled' },
};

/**
 * PublicCard - Card for published media in spot galleries, cart, favorites
 *
 * Features:
 * - Configurable action buttons (cart, favorites, share, report)
 * - Selection checkbox (via BaseCard)
 * - Clean design for public-facing galleries
 * - Parent controls which actions to show (empty array during selection mode)
 */
const OWNER_BADGE = (
  <Badge size="xs" variant="filled" color="gray" radius="sm">
    Yours
  </Badge>
);

const PURCHASED_BADGE = (
  <Badge size="xs" variant="filled" color="teal" radius="sm">
    Purchased
  </Badge>
);

const PublicCard: FC<PublicCardProps> = memo(({
  mediaItem,
  actions = [],
  activeActions = [],
  onAction,
  onCardClick,
  showOwnerBadge = false,
  showPurchasedBadge = false,
  dense = false,
}) => {
  const handleClick = useCallback(() => {
    onCardClick?.(mediaItem.id);
  }, [onCardClick, mediaItem.id]);

  // There is no way to know a thumbnail is good before the browser confirms it — so price,
  // dimensions, and purchase actions only appear once the image has actually finished loading
  // (mediaReady), rather than optimistically on mount and being retracted if it turns out
  // broken. That retract-after-the-fact was visible as a flash. The captured date is exempt:
  // it comes from server data, not the image load, and identifies *which* shoot a card belongs
  // to even while broken — so it stays visible unconditionally.
  // Keyed by url, mirroring BaseCard's failedUrl: a card handed a different thumbnail must not
  // carry the previous url's verdict (stale broken hides price forever; stale loaded shows it
  // before the new thumbnail is confirmed).
  const [thumb, setThumb] = useState({ url: mediaItem.thumbnailUrl, loaded: false, broken: false });
  if (thumb.url !== mediaItem.thumbnailUrl) {
    setThumb({ url: mediaItem.thumbnailUrl, loaded: false, broken: false });
  }
  const isBroken = thumb.broken;
  const mediaReady = thumb.loaded && !thumb.broken;
  const handleLoad = useCallback(() => setThumb((s) => ({ ...s, loaded: true })), []);
  const handleBrokenChange = useCallback((broken: boolean) => setThumb((s) => ({ ...s, broken })), []);

  const dimensions = mediaReady ? formatDimensions(mediaItem.width, mediaItem.height) : null;
  // Previously this badge group only rendered when a price existed; broken media broadens that
  // to "price OR broken" so the date still identifies an unavailable card with no price set.
  const priceDateBadge = (mediaItem.price != null || isBroken) && (
    <Group gap={4} wrap="wrap">
      {mediaItem.price != null && mediaReady && (
        <Badge size="xs" variant={mediaItem.price > 0 ? 'filled' : 'light'} color={mediaItem.price > 0 ? 'blue' : 'gray'}>
          {formatPrice(mediaItem.price)}
        </Badge>
      )}
      <Text size="xs" fw={600} className={materialClasses.mediaTextOverlay}>
        {formatCapturedAtDate(mediaItem.capturedAt)}
      </Text>
      {dimensions && (
        <Text size="xs" className={materialClasses.mediaTextOverlay} style={{ opacity: 0.7 }}>
          {dimensions}
        </Text>
      )}
    </Group>
  );
  const statusBadge = showOwnerBadge ? OWNER_BADGE : showPurchasedBadge ? PURCHASED_BADGE : null;

  // Cart/favorites invite purchase behavior that doesn't apply until media is confirmed viewable;
  // share/report still make sense before then (e.g. reporting a broken listing), so only those
  // two purchase-related actions wait for mediaReady.
  const visibleActions = mediaReady ? actions : actions.filter(a => a !== 'cart' && a !== 'favorites');

  // Dense tiles carry a single passive glyph — the most advanced state that's
  // true — as a bare icon over the photo. Actions live in the lightbox on tap.
  const denseGlyph = showPurchasedBadge
    ? { icon: IconShoppingBag, label: 'Purchased', fill: false }
    : showOwnerBadge
      ? { icon: IconUser, label: 'Your photo', fill: false }
      : mediaReady && activeActions.includes('cart')
        ? { icon: IconShoppingCart, label: 'In cart', fill: false }
        : mediaReady && activeActions.includes('favorites')
          ? { icon: IconHeart, label: 'Favorited', fill: true }
          : null;
  const DenseGlyphIcon = denseGlyph?.icon;
  const denseStateGlyph = dense && denseGlyph && DenseGlyphIcon && (
    <DenseGlyphIcon
      size={16}
      stroke={2}
      fill={denseGlyph.fill ? 'currentColor' : 'none'}
      aria-label={denseGlyph.label}
    />
  );

  return (
    <BaseCard
      imageUrl={mediaItem.thumbnailUrl}
      resourceType={mediaItem.type === 'VIDEO' ? 'video' : 'image'}
      alt={`Surf ${mediaItem.type === 'VIDEO' ? 'video' : 'photo'} from ${formatCapturedAtDate(mediaItem.capturedAt)}`}
      onClick={onCardClick ? handleClick : undefined}
      flush={dense}
      onLoad={handleLoad}
      onBrokenChange={handleBrokenChange}
      overlays={
        dense ? undefined : priceDateBadge || statusBadge ? <>{priceDateBadge}{statusBadge}</> : undefined
      }
      cornerGlyph={dense ? denseStateGlyph || undefined : undefined}
      actions={
        dense ? undefined : visibleActions.length > 0 ? (
          <Group gap="xs">
            {visibleActions.map((actionType) => {
              const config = ACTION_ICONS[actionType];
              const isActive = activeActions.includes(actionType);
              const resolved = isActive && ACTION_ICONS_ACTIVE[actionType]
                ? { ...config, ...ACTION_ICONS_ACTIVE[actionType]! }
                : config;
              const Icon = resolved.icon;

              return (
                <ActionIcon
                  key={actionType}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mantine variant type narrows too strictly for dynamic action configs
                  variant={resolved.variant as any}
                  color={resolved.color}
                  size="md"
                  radius="xl"
                  aria-label={resolved.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(actionType, mediaItem.id);
                  }}
                >
                  <Icon
                    size={16}
                    fill={actionType === 'favorites' && isActive ? 'currentColor' : 'none'}
                  />
                </ActionIcon>
              );
            })}
          </Group>
        ) : undefined
      }
    />
  );
});

PublicCard.displayName = 'PublicCard';

export default PublicCard;
