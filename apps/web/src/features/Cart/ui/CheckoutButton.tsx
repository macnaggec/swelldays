import { IconShoppingCart } from '@tabler/icons-react';
import { AppButton } from 'shared/ui/AppButton';

export interface CheckoutButtonProps {
  isPending: boolean;
  onCheckout: () => void;
}

export function CheckoutButton({ isPending, onCheckout }: CheckoutButtonProps) {
  return (
    <AppButton
      tone="positive"
      leftSection={<IconShoppingCart size={20} />}
      loading={isPending}
      onClick={onCheckout}
    >
      Checkout
    </AppButton>
  );
}
