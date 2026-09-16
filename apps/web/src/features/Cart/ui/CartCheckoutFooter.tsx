import { Stack } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import { CartTotal } from './CartTotal';
import { CheckoutButton } from './CheckoutButton';
import styles from './CartCheckoutFooter.module.css';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';

export interface CartCheckoutFooterProps {
  totalCents: number;
  isPending: boolean;
  status: BuyerCheckoutStatus | null;
  onCheckout: () => void;
}

export function CartCheckoutFooter({ totalCents, isPending, status, onCheckout }: CartCheckoutFooterProps) {
  return (
    <Stack
      gap={10}
      align="center"
      className={`${styles.substrate} ${materialClasses.chrome}`}
      data-cart-checkout-footer
    >
      <CartTotal totalCents={totalCents} />
      <CheckoutButton isPending={isPending} status={status} onCheckout={onCheckout} />
    </Stack>
  );
}
