import { FC, memo, useCallback } from 'react';
import { ActionIcon, Text, Stack } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { CartItem } from 'entities/Commerce';
import { formatPrice } from 'shared/lib/currency';
import { formatShortDate } from 'shared/lib/dateUtils';
import { BaseCard } from 'shared/ui/BaseGallery';
import classes from './CartCard.module.css';

export interface CartCardProps {
  item: CartItem;
  onRemove: (id: string) => void;
  onClick?: () => void;
  disabled?: boolean;
}

/**
 * CartCard — gallery card for items in the cart.
 *
 * Mirrors PublicCard visually: same BaseCard shell, same action slot.
 * Single action: remove from cart (trash icon).
 */
const CartCard: FC<CartCardProps> = memo(({ item, onRemove, onClick, disabled = false }) => {
  const handleRemove = useCallback(
    () => {
      if (!disabled) onRemove(item.id);
    },
    [disabled, onRemove, item.id],
  );

  return (
    <BaseCard
      imageUrl={item.thumbnailUrl}
      resourceType="image"
      alt={item.label}
      onClick={disabled ? undefined : onClick}
      overlays={
        <Stack gap={2}>
          <Text size="xs" fw={700} c="white" className={classes.priceLabel}>
            {item.spotName}
          </Text>
          <Text size="xs" c="white" className={classes.priceLabel}>
            {formatShortDate(item.capturedAt)}
          </Text>
          <Text size="xs" fw={600} c="white" className={classes.priceLabel}>
            {formatPrice(item.priceCents)}
          </Text>
        </Stack>
      }
      actions={
        <ActionIcon
          variant="filled"
          color="red"
          size="md"
          radius="xl"
          aria-label={`Remove ${item.label} from cart`}
          disabled={disabled}
          onClick={handleRemove}
        >
          <IconTrash size={14} />
        </ActionIcon>
      }
    />
  );
});

CartCard.displayName = 'CartCard';

export default CartCard;
