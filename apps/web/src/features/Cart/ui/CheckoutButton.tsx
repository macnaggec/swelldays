import { IconShoppingCart } from '@tabler/icons-react';
import { AppButton } from 'shared/ui/AppButton';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';

export interface CheckoutButtonProps {
  isPending: boolean;
  status: BuyerCheckoutStatus | null;
  onCheckout: () => void;
}

export function CheckoutButton({ isPending, status, onCheckout }: CheckoutButtonProps) {
  const label = isPending
    ? 'Checking payment…'
    : status?.state === 'ready'
    ? 'Resume checkout'
    : status?.state === 'failed'
      ? 'Try checkout again'
      : status?.state === 'paid'
        ? 'View purchases'
      : status?.state === 'creating' || status?.state === 'unknown' || status?.state === 'processing'
        ? 'Checking payment…'
        : 'Checkout';
  return (
    <AppButton
      tone="positive"
      leftSection={<IconShoppingCart size={20} />}
      disabled={isPending}
      onClick={onCheckout}
    >
      {label}
    </AppButton>
  );
}
