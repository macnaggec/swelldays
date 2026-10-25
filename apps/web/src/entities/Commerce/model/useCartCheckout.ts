import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  BuyerCheckoutStatus,
  CheckoutOwnMediaErrorDetails,
} from '@swelldays/contracts/validation/checkout';
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
  selfPurchaseItemIds: string[];
  removeSelfPurchaseItems: () => void;
}

const STORAGE_PREFIX = 'swelldays.checkout.v1:';
const POLL_INTERVAL_MS = 2_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKeyFor(itemIds: string[]): string {
  return `${STORAGE_PREFIX}${[...itemIds].sort().join(',')}`;
}

function isTransient(status: BuyerCheckoutStatus | undefined): boolean {
  return status?.state === 'creating' || status?.state === 'unknown' || status?.state === 'processing';
}

function getErrorDetails(error: unknown): unknown {
  if (typeof error !== 'object' || error === null || !('data' in error)) return undefined;
  const data = error.data;
  if (typeof data !== 'object' || data === null || !('details' in data)) return undefined;
  return data.details;
}

function parseOwnMediaErrorDetails(value: unknown): CheckoutOwnMediaErrorDetails | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'reason' && key !== 'mediaItemIds')) return null;
  if (record.reason !== 'own-media' || !Array.isArray(record.mediaItemIds)) return null;
  if (record.mediaItemIds.length === 0 || !record.mediaItemIds.every(
    (item): item is string => typeof item === 'string' && UUID_PATTERN.test(item),
  )) return null;
  return { reason: 'own-media', mediaItemIds: record.mediaItemIds };
}

export function useCartCheckout(returnOrderId?: string): CartCheckout {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const totalCents = useCartStore((s) => s.totalCents());
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();
  const [isOpeningCheckout, setIsOpeningCheckout] = useState(false);
  const [selfPurchaseItemIds, setSelfPurchaseItemIds] = useState<string[]>([]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const storageKey = useMemo(() => storageKeyFor(itemIds), [itemIds]);
  const [storedAttempt, setStoredAttempt] = useState(() => ({
    storageKey,
    clientRequestId: localStorage.getItem(storageKey),
  }));
  const clientRequestId = storedAttempt.storageKey === storageKey
    ? storedAttempt.clientRequestId
    : localStorage.getItem(storageKey);
  const statusLocator = returnOrderId === undefined
    ? { clientRequestId: clientRequestId ?? '00000000-0000-4000-8000-000000000000' }
    : { orderId: returnOrderId };

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
    ...trpc.checkout.status.queryOptions(statusLocator),
    enabled: isAuthenticated && (returnOrderId !== undefined || clientRequestId !== null),
    refetchInterval: (query) => isTransient(query.state.data)
      || returnOrderId !== undefined && query.state.data?.state === 'ready'
      ? POLL_INTERVAL_MS
      : false,
  });

  const openCheckout = useCallback((checkoutUrl: string) => {
    // Navigation does not unmount this route synchronously. Keep the cart locked
    // across the gap after the mutation settles and before Paddle's checkout route
    // takes over, instead of relying only on React Query's mutation pending state.
    setIsOpeningCheckout(true);
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
    onError: async (error) => {
      const ownMedia = parseOwnMediaErrorDetails(getErrorDetails(error));
      if (ownMedia !== null) {
        setSelfPurchaseItemIds(ownMedia.mediaItemIds);
        return;
      }
      const refreshedStatus = await statusQuery.refetch();
      if (refreshedStatus.data?.state === 'failed') {
        notify.error('Checkout could not be started. Please try again.', 'Checkout failed');
        return;
      }
      notify.error(
        'Checkout response was interrupted. Checking your payment status…',
        'Checkout interrupted',
      );
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

  const removeSelfPurchaseItems = useCallback(() => {
    const rejectedIds = new Set(selfPurchaseItemIds);
    useCartStore.setState((state) => ({
      items: state.items.filter((item) => !rejectedIds.has(item.id)),
    }));
    setSelfPurchaseItemIds([]);
  }, [selfPurchaseItemIds]);

  return {
    handleCheckout,
    isPending: isOpeningCheckout
      || checkout.isPending
      || isTransient(statusQuery.data)
      || statusQuery.data?.state === 'paid'
      || returnOrderId !== undefined
        && (statusQuery.data === undefined || statusQuery.data.state === 'ready'),
    totalCents,
    status: statusQuery.data ?? null,
    selfPurchaseItemIds,
    removeSelfPurchaseItems,
  };
}
