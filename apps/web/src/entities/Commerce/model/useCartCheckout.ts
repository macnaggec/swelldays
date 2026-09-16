import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';
import { useTRPC } from 'shared/lib/trpc';
import { useCartStore } from 'entities/Commerce/model/cartStore';
import { notify } from 'shared/lib/notifications';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'entities/Identity';

export interface CartCheckout {
  handleCheckout: () => void;
  isPending: boolean;
  totalCents: number;
  status: BuyerCheckoutStatus | null;
}

const STORAGE_PREFIX = 'swelldays.checkout.v1:';
const POLL_INTERVAL_MS = 2_000;

function storageKeyFor(itemIds: string[]): string {
  return `${STORAGE_PREFIX}${[...itemIds].sort().join(',')}`;
}

function isTransient(status: BuyerCheckoutStatus | undefined): boolean {
  return status?.state === 'creating' || status?.state === 'unknown' || status?.state === 'processing';
}

export function useCartCheckout(): CartCheckout {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const storageKey = useMemo(() => storageKeyFor(itemIds), [itemIds]);
  const [storedAttempt, setStoredAttempt] = useState(() => ({
    storageKey,
    clientRequestId: localStorage.getItem(storageKey),
  }));
  const clientRequestId = storedAttempt.storageKey === storageKey
    ? storedAttempt.clientRequestId
    : localStorage.getItem(storageKey);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setStoredAttempt({ storageKey, clientRequestId: event.newValue });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [storageKey]);

  const statusQuery = useQuery({
    ...trpc.checkout.status.queryOptions(
      { clientRequestId: clientRequestId ?? '00000000-0000-4000-8000-000000000000' },
    ),
    enabled: isAuthenticated && clientRequestId !== null,
    refetchInterval: (query) => isTransient(query.state.data) ? POLL_INTERVAL_MS : false,
  });

  const openCheckout = useCallback((checkoutUrl: string) => {
    const checkoutLocation = new URL(checkoutUrl, window.location.origin);
    if (checkoutLocation.origin === window.location.origin) {
      void navigate({ href: `${checkoutLocation.pathname}${checkoutLocation.search}${checkoutLocation.hash}` });
      return;
    }
    window.location.href = checkoutUrl;
  }, [navigate]);

  const checkout = useMutation({
    ...trpc.checkout.create.mutationOptions(),
    onSuccess: ({ checkoutUrl }) => openCheckout(checkoutUrl),
    onError: () => {
      void statusQuery.refetch();
      notify.error('Checkout response was interrupted. Checking your payment status…');
    },
  });

  const submit = useCallback((requestId: string) => {
    checkout.mutate({ itemIds, clientRequestId: requestId });
  }, [checkout, itemIds]);

  const continueCheckout = useCallback(() => {
    const status = statusQuery.data;
    if (status?.state === 'ready') {
      openCheckout(status.checkoutUrl);
      return;
    }
    if (status?.state === 'paid') {
      void navigate({ href: `/me/collections/purchases?order=${status.orderId}` });
      return;
    }
    if (isTransient(status)) {
      void statusQuery.refetch();
      return;
    }

    let requestId = clientRequestId;
    if (status?.state === 'failed' || requestId === null) {
      requestId = uuidv4();
      localStorage.setItem(storageKey, requestId);
      setStoredAttempt({ storageKey, clientRequestId: requestId });
    }
    submit(requestId);
  }, [clientRequestId, navigate, openCheckout, statusQuery, storageKey, submit]);

  const handleCheckout = () => {
    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: continueCheckout });
      return;
    }
    continueCheckout();
  };

  return {
    handleCheckout,
    isPending: checkout.isPending || statusQuery.isFetching && isTransient(statusQuery.data),
    totalCents,
    status: statusQuery.data ?? null,
  };
}
