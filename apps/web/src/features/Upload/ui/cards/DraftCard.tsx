import React, { FC, ReactNode, memo } from 'react';
import { Box } from '@mantine/core';
import { BaseCard } from 'shared/ui/BaseGallery';
import classes from './DraftCard.module.css';

/**
 * Validation state for a draft card
 */
export interface ValidationState {
  /** Whether the card has validation errors */
  hasError: boolean;
  /** Optional error message */
  message?: string;
}

/**
 * Props for DraftCard component
 */
export interface DraftCardProps {
  /** Image URL (JPEG poster frame for videos, thumbnail for images) */
  imageUrl: string;

  /** Resource type */
  resourceType: 'image' | 'video';

  /** Alt text */
  alt?: string;

  /** Overlay content (date/price or upload progress) */
  overlays?: ReactNode;

  /** Optional action content */
  actions?: ReactNode;

  /** Validation state (shows red border if hasError) */
  validation?: ValidationState;
}

/**
 * DraftCard - Specialized card for draft uploads in the Upload feature
 *
 * Wraps BaseCard with validation border logic. Accepts overlay slot
 * to display either upload progress or draft metadata.
 *
 * @example
 * ```tsx
 * // With draft metadata
 * <DraftCard
 *   imageUrl={item.result.resource.url}
 *   resourceType={item.result.resource.resourceType}
 *   overlays={<DraftOverlays mediaItem={item.result} />}
 *   validation={{ hasError: !item.result.capturedAt }}
 * />
 * ```
 */
const DraftCard: FC<DraftCardProps> = memo(({
  imageUrl,
  resourceType,
  alt,
  overlays,
  actions,
  validation,
}) => {
  return (
    <Box className={validation?.hasError ? classes.error : undefined}>
      <BaseCard
        imageUrl={imageUrl}
        resourceType={resourceType}
        alt={alt}
        overlays={overlays}
        actions={actions}
      />
    </Box>
  );
});

DraftCard.displayName = 'DraftCard';

export default DraftCard;
