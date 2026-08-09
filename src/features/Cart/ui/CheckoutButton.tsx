import { Button } from '@mantine/core';
import { IconShoppingCart } from '@tabler/icons-react';
import styles from './CheckoutButton.module.css';

export interface CheckoutButtonProps {
  isPending: boolean;
  onCheckout: () => void;
}

export function CheckoutButton({ isPending, onCheckout }: CheckoutButtonProps) {
  return (
    <Button
      className={styles.button}
      data-panel-gallery-primary-action="glass-green"
      data-panel-gallery-primary-action-size="compact"
      leftSection={<IconShoppingCart size={20} />}
      loading={isPending}
      onClick={onCheckout}
    >
      Checkout
    </Button>
  );
}
