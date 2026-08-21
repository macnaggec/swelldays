

import React, { FC, ReactNode, memo, useState } from 'react';
import { Box } from '@mantine/core';
import { IconPlayerPlay, IconPhotoOff } from '@tabler/icons-react';
import classes from './BaseCard.module.css';

/**
 * Props for BaseCard component
 */
export interface BaseCardProps {
  /** Image URL (JPEG poster frame for videos, thumbnail for images) */
  imageUrl: string;

  /** Resource type - image or video */
  resourceType: 'image' | 'video';

  /** Alt text for accessibility */
  alt?: string;

  /** Optional overlay content (stacked over image in top-left) */
  overlays?: ReactNode;

  /** Single glyph anchored to the top-left corner over a darkening scrim (dense grids). */
  cornerGlyph?: ReactNode;

  /** Optional action content (positioned bottom-right or as context menu) */
  actions?: ReactNode;

  /** Optional className for customization */
  className?: string;

  /** Drop the corner radius for gapless, edge-to-edge dense grids. */
  flush?: boolean;

  /** Click handler for the card (e.g. open lightbox) */
  onClick?: () => void;

  /**
   * Reports whether the thumbnail failed to load. BaseCard only detects and displays the
   * failure — deciding which overlays/actions still make sense on broken media (e.g. keep
   * the date, drop price/cart) is a per-consumer business call, made by whoever composed
   * those slots in the first place.
   */
  onBrokenChange?: (broken: boolean) => void;

  /**
   * Fires once the thumbnail has actually finished loading. Content that would otherwise show
   * optimistically and later have to be retracted on failure (price, cart/favorite actions)
   * should wait for this rather than assuming success from mount — there's no way to know a
   * thumbnail is good before the browser confirms it, so anything shown before that point can
   * only ever be shown speculatively.
   */
  onLoad?: () => void;
}

/**
 * BaseCard - Foundation card component for all gallery cards
 *
 * Renders a static thumbnail (always an <img>) with optional overlays, actions,
 * and a play indicator for video cards. Video playback belongs in the lightbox.
 */
const BaseCard: FC<BaseCardProps> = memo(({
  imageUrl,
  resourceType,
  alt = 'Media',
  overlays,
  cornerGlyph,
  actions,
  className,
  flush = false,
  onClick,
  onBrokenChange,
  onLoad,
}) => {
  // Track the url that failed to load rather than a bare boolean, so a memoized card reused
  // for a different item (virtualized grids) doesn't carry a stale failure onto a good image.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageFailed = !!imageUrl && failedUrl === imageUrl;

  // Fired synchronously inside the onError handler (not a useEffect): batching it with
  // setFailedUrl means BaseCard's own fallback and the caller's onBrokenChange-driven state
  // (e.g. hiding price/cart) land in the same commit — no one-frame flash where the broken
  // placeholder shows while price/actions are still visible.
  const handleImageError = () => {
    // A broken src usually means a DB row pointing at a dead CDN asset — surface it.
    console.warn('[BaseCard] thumbnail failed to load:', imageUrl);
    setFailedUrl(imageUrl);
    onBrokenChange?.(true);
  };

  return (
    <Box
      className={`${classes.card} ${className || ''}`}
      data-media-card-aspect="tall"
      data-media-card-flush={flush || undefined}
      data-media-unavailable={imageFailed || undefined}
      // A broken thumbnail doesn't imply the full-size media is broken (different urls) — the
      // card stays clickable, and the lightbox shows its own placeholder if that fails too.
      onClick={onClick}
    >
      {imageUrl && (
        imageFailed ? (
          <div className={classes.mediaFallback} role="img" aria-label={`${alt} — image unavailable`}>
            <IconPhotoOff size={28} stroke={1.5} />
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={alt}
            className={classes.nativeMedia}
            onLoad={onLoad}
            onError={handleImageError}
          />
        )
      )}

      {onClick && (
        <button
          type="button"
          className={classes.openButton}
          aria-label={`Open ${alt}`}
          data-media-card-open="true"
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
        />
      )}

      {resourceType === 'video' && (
        <div className={classes.videoIndicator}>
          <IconPlayerPlay size={16} />
        </div>
      )}

      {/* Overlays slot (top-left: date/price badges, metadata) */}
      {overlays && (
        <Box className={classes.overlays}>
          {overlays}
        </Box>
      )}

      {/* Corner glyph slot (top-left corner: single state glyph over a scrim) */}
      {cornerGlyph && (
        <Box className={classes.cornerGlyph}>
          {cornerGlyph}
        </Box>
      )}

      {/* Actions slot (bottom-right: cart, favorites, delete buttons) */}
      {actions && (
        <Box
          className={classes.actions}
          data-gallery-card-actions="glass"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
});

BaseCard.displayName = 'BaseCard';

export default BaseCard;
