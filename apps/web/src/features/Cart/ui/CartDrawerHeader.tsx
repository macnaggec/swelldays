import { memo } from 'react';
import { ActionIcon, Text } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import styles from './CartDrawerHeader.module.css';

interface CartDrawerHeaderProps {
  itemCount: number;
  spotName?: string;
  onBack?: () => void;
}

/**
 * CartDrawerHeader — navigation/title row for the cart panel.
 *
 * Optional originating spot link sits on the left edge while the cart title stays centered.
 */
export const CartDrawerHeader = memo(function CartDrawerHeader({
  itemCount,
  spotName,
  onBack,
}: CartDrawerHeaderProps) {
  const backLabel = spotName ?? 'Back to feed';

  return (
    <div className={styles.header}>
      <div className={styles.headerStart}>
        {onBack && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="md"
            aria-label={backLabel}
            onClick={onBack}
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
        )}
      </div>
      <Text className={styles.headerTitle} fw={600} size="lg" ta="center">
        Cart{itemCount > 0 ? ` (${itemCount})` : ''}
      </Text>
      <div aria-hidden="true" />
    </div>
  );
});
