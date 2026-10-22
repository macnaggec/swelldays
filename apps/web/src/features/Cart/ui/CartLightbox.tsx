import { FC, memo, useCallback } from 'react';
import { ActionIcon, Badge, Group, Text, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { formatPrice } from 'shared/lib/currency';
import { formatShortDate } from 'shared/lib/dateUtils';
import { BaseLightbox } from 'shared/ui/BaseLightbox';
import type { CartItem } from 'entities/Commerce';

export interface CartLightboxProps {
  item: CartItem | null;
  onClose: () => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

/**
 * CartLightbox — single-item watermarked preview before checkout.
 * No carousel: the cart grid already shows all items; this is a verify-before-buying modal.
 */
const CartLightbox: FC<CartLightboxProps> = memo(({
  item,
  onClose,
  onRemove,
  disabled = false,
}) => {
  const handleRemove = useCallback(() => {
    if (!item || disabled) return;
    onRemove(item.id);
    onClose();
  }, [disabled, item, onRemove, onClose]);

  const lightboxItem = item ? { id: item.id, url: item.lightboxUrl } : null;

  return (
    <BaseLightbox
      item={lightboxItem}
      onClose={onClose}
      renderOverlay={item ? () => (
        <Group gap="xs" wrap="nowrap">
          <Badge size="lg" color="blue" variant="filled">{formatPrice(item.priceCents)}</Badge>
          <Text size="sm" c="white" fw={600}>{item.spotName}</Text>
          <Text size="sm" c="white" style={{ opacity: 0.75 }}>
            {formatShortDate(item.capturedAt)}
          </Text>
        </Group>
      ) : undefined}
      renderActions={item ? () => (
        <Tooltip label="Remove from cart" withArrow withinPortal zIndex={4000}>
          <ActionIcon
            aria-label="Remove from cart"
            data-lightbox-icon-action="true"
            data-lightbox-icon-frame="chip"
            data-lightbox-tooltip-layer="above-media"
            variant="subtle"
            color="red"
            size={44}
            radius="xl"
            disabled={disabled}
            onClick={handleRemove}
          >
            <IconTrash size={24} stroke={2} />
          </ActionIcon>
        </Tooltip>
      ) : undefined}
    />
  );
});

CartLightbox.displayName = 'CartLightbox';
export default CartLightbox;
