import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
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

function itemIdsChanged(prev: string[] | null, next: string[]): boolean {
  if (prev === null) return true;
  if (prev.length !== next.length) return true;
  const prevSet = new Set(prev);
  return next.some((id) => !prevSet.has(id));
}

export function useCartCheckout(): CartCheckout {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();

  const clientRequestIdRef = useRef<string | null>(null);
  const clientRequestItemIdsRef = useRef<string[] | null>(null);

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
      clientRequestIdRef.current = null;
      clientRequestItemIdsRef.current = null;
      notify.error(
        error instanceof Error ? error.message : 'Checkout failed. Please try again'
      );
    },
  });

  const handleCheckout = () => {
    const itemIds = items.map((i) => i.id);

    if (clientRequestIdRef.current === null || itemIdsChanged(clientRequestItemIdsRef.current, itemIds)) {
      clientRequestIdRef.current = uuidv4();
      clientRequestItemIdsRef.current = itemIds;
    }

    const clientRequestId = clientRequestIdRef.current;
    const submit = () => checkout.mutate({ itemIds, clientRequestId });
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
