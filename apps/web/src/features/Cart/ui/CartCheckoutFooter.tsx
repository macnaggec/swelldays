import { Stack } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import { CartTotal } from './CartTotal';
import { CheckoutButton } from './CheckoutButton';
import styles from './CartCheckoutFooter.module.css';

export interface CartCheckoutFooterProps {
  totalCents: number;
  isPending: boolean;
  onCheckout: () => void;
}

export function CartCheckoutFooter({ totalCents, isPending, onCheckout }: CartCheckoutFooterProps) {
  return (
    <Stack
      gap={10}
      align="center"
      className={`${styles.substrate} ${materialClasses.chrome}`}
      data-cart-checkout-footer
    >
      <CartTotal totalCents={totalCents} />
      <CheckoutButton isPending={isPending} onCheckout={onCheckout} />
    </Stack>
  );
}
