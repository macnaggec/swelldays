import { Text } from '@mantine/core';
import { formatPrice } from 'shared/lib/currency';
import styles from './CartTotal.module.css';

export interface CartTotalProps {
  totalCents: number;
}

export function CartTotal({ totalCents }: CartTotalProps) {
  return (
    <Text className={styles.amount}>
      <span className={styles.label}>Total: </span>
      {formatPrice(totalCents)}
    </Text>
  );
}
