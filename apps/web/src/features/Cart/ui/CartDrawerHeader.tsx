import { memo } from 'react';
import { Anchor, Group, Text } from '@mantine/core';
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
          <Anchor
            component="button"
            size="xs"
            c="dimmed"
            onClick={onBack}
          >
            <Group gap={2} align="center">
              <IconChevronLeft size={12} />
              {backLabel}
            </Group>
          </Anchor>
        )}
      </div>
      <Text className={styles.headerTitle} fw={600} size="lg" ta="center">
        Cart{itemCount > 0 ? ` (${itemCount})` : ''}
      </Text>
      <div aria-hidden="true" />
    </div>
  );
});
