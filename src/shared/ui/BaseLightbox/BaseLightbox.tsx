import { FC, memo, ReactNode } from 'react';
import { CarouselLightbox, type CarouselLightboxItem } from 'shared/ui/CarouselLightbox';

export type BaseLightboxItem = CarouselLightboxItem;

export interface BaseLightboxProps {
  /** null = modal closed */
  item: BaseLightboxItem | null;
  onClose: () => void;
  /** Render badges or metadata in the caption above the media. */
  renderOverlay?: () => ReactNode;
  /** Render icon actions in the floating action area. */
  renderActions?: () => ReactNode;
}

/**
 * BaseLightbox — single-item adapter over CarouselLightbox.
 *
 * Maps the item/null open-closed API onto the shared lightbox, which owns the
 * modal shell, media readiness, loader, and control chrome. With a single item
 * the carousel renders no navigation controls.
 */
const BaseLightbox: FC<BaseLightboxProps> = memo(({ item, onClose, renderOverlay, renderActions }) => (
  <CarouselLightbox
    items={item ? [item] : []}
    initialIndex={0}
    opened={item !== null}
    onClose={onClose}
    renderOverlay={renderOverlay}
    renderActions={renderActions}
  />
));

BaseLightbox.displayName = 'BaseLightbox';
export default BaseLightbox;
