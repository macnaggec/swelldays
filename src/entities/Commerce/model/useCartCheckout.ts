import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTRPC } from 'shared/lib/trpc';
import { useCartStore } from 'entities/Commerce/model/cartStore';
import { notify } from 'shared/lib/notifications';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'entities/Identity';

export interface CartCheckout {
  handleCheckout: () => void;
  isPending: boolean;
  totalCents: number;
}

export function useCartCheckout(): CartCheckout {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();

  const checkout = useMutation({
    ...trpc.checkout.create.mutationOptions(),
    onSuccess: ({ checkoutUrl }) => {
      const checkoutLocation = new URL(checkoutUrl, window.location.origin);
      if (checkoutLocation.origin === window.location.origin) {
        void navigate({
          href: `${checkoutLocation.pathname}${checkoutLocation.search}${checkoutLocation.hash}`,
        });
        return;
      }

      window.location.href = checkoutUrl;
    },
    onError: (error) => {
      notify.error(
        error instanceof Error ? error.message : 'Checkout failed. Please try again'
      );
    },
  });

  const handleCheckout = () => {
    const submit = () => checkout.mutate({ itemIds: items.map((i) => i.id) });
    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: submit });
      return;
    }
    submit();
  };

  return {
    handleCheckout,
    isPending: checkout.isPending,
    totalCents: totalCents,
  };
}
