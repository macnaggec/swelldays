import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from './cartStore';
import { useCartCheckout } from './useCartCheckout';
import type { CartItem } from './types';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';

const mocks = vi.hoisted(() => {
  let mutationInput: { itemIds: string[]; clientRequestId: string } | undefined;
  let status: BuyerCheckoutStatus | undefined;
  return {
    mutationInput,
    checkoutUrl: '',
    navigate: vi.fn(),
    isAuthenticated: true,
    openAuthModal: vi.fn(),
    shouldError: false,
    mutationError: new Error('Checkout failed') as unknown,
    status,
    statusQueryInput: undefined as { orderId: string } | { clientRequestId: string } | undefined,
    refetchStatus: vi.fn(),
    notifyError: vi.fn(),
  };
});

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock('entities/Identity', () => ({
  useAuthModal: () => ({ open: mocks.openAuthModal }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mocks.status,
      isFetching: false,
      refetch: mocks.refetchStatus,
    }),
    useMutation: (options: {
      onSuccess?: (data: { checkoutUrl: string; orderId: string }) => void;
      onError?: (error: unknown) => void;
    }) => ({
      isPending: false,
      mutate: (input: { itemIds: string[]; clientRequestId: string }) => {
        mocks.mutationInput = input;
        if (mocks.shouldError) {
          options.onError?.(mocks.mutationError);
          return;
        }
        options.onSuccess?.({
          checkoutUrl: mocks.checkoutUrl,
          orderId: 'order-1',
        });
      },
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    checkout: {
      create: {
        mutationOptions: () => ({}),
      },
      status: {
        queryOptions: (input: { orderId: string } | { clientRequestId: string }) => {
          mocks.statusQueryInput = input;
          return {};
        },
      },
    },
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

const originalClear = useCartStore.getState().clear;

describe('useCartCheckout', () => {
  const item: CartItem = {
    id: 'media-1',
    label: 'Pipeline · Jan 1, 2026',
    spotName: 'Pipeline',
    capturedAt: '2026-01-01T00:00:00.000Z',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    lightboxUrl: 'https://example.com/preview.jpg',
    priceCents: 300,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationInput = undefined;
    mocks.checkoutUrl = `${window.location.origin}/me/collections/purchases?order=order-1`;
    mocks.isAuthenticated = true;
    mocks.shouldError = false;
    mocks.mutationError = new Error('Checkout failed');
    mocks.status = undefined;
    mocks.statusQueryInput = undefined;
    mocks.refetchStatus.mockReset().mockResolvedValue({ data: undefined });
    window.history.replaceState({}, '', '/cart');
    localStorage.clear();
    useCartStore.setState({
      items: [item],
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => {
      useCartStore.setState({
        items: [],
        clear: originalClear,
      });
    });
  });

  it('keeps cart items after creating a checkout session', async () => {
    const { result } = renderHook(() => useCartCheckout());
    const clear = useCartStore.getState().clear;

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(mocks.mutationInput?.itemIds).toEqual(['media-1']);
    expect(mocks.mutationInput?.clientRequestId).toEqual(expect.any(String));
    expect(clear).not.toHaveBeenCalled();
  });

  it('opens same-origin checkout return URLs through the app router', async () => {
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      href: '/me/collections/purchases?order=order-1',
    });
  });

  it('keeps cart interaction locked after checkout creation until navigation unmounts it', async () => {
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(mocks.navigate).toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
  });

  it('opens the auth modal and skips checkout when the buyer is unauthenticated', async () => {
    mocks.isAuthenticated = false;
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(mocks.openAuthModal).toHaveBeenCalledTimes(1);
    expect(mocks.mutationInput).toBeUndefined();
  });

  it('completes checkout once the buyer signs in', async () => {
    mocks.isAuthenticated = false;
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(mocks.mutationInput).toBeUndefined();

    const { onAuthenticated } = mocks.openAuthModal.mock.calls[0]?.[0] as { onAuthenticated: () => void };

    await act(async () => {
      onAuthenticated();
    });

    expect(mocks.mutationInput?.itemIds).toEqual(['media-1']);
    expect(mocks.mutationInput?.clientRequestId).toEqual(expect.any(String));
  });

  it('reuses the same clientRequestId across repeated checkout attempts for the same cart', async () => {
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });
    const firstId = mocks.mutationInput?.clientRequestId;

    await act(async () => {
      result.current.handleCheckout();
    });
    const secondId = mocks.mutationInput?.clientRequestId;

    expect(firstId).toBeDefined();
    expect(secondId).toBe(firstId);
  });

  it('reuses the persisted key after unmount and remount', async () => {
    const first = renderHook(() => useCartCheckout());
    await act(async () => first.result.current.handleCheckout());
    const requestId = mocks.mutationInput?.clientRequestId;
    first.unmount();

    const second = renderHook(() => useCartCheckout());
    await act(async () => second.result.current.handleCheckout());

    expect(mocks.mutationInput?.clientRequestId).toBe(requestId);
  });

  it('observes a persisted key written by another tab', async () => {
    const requestId = '11111111-1111-4111-8111-111111111111';
    const { result } = renderHook(() => useCartCheckout());

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'swelldays.checkout.v1:media-1',
        newValue: requestId,
      }));
    });
    await act(async () => result.current.handleCheckout());

    expect(mocks.mutationInput?.clientRequestId).toBe(requestId);
  });

  it.each<BuyerCheckoutStatus>([
    { state: 'creating', orderId: 'order-1' },
    { state: 'unknown', orderId: 'order-1', reason: 'provider-timeout' },
    { state: 'processing', orderId: 'order-1' },
  ])('checks transient status $state without creating another checkout', async (status) => {
    mocks.status = status;
    localStorage.setItem('swelldays.checkout.v1:media-1', '11111111-1111-4111-8111-111111111111');
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => result.current.handleCheckout());

    expect(mocks.refetchStatus).toHaveBeenCalled();
    expect(mocks.mutationInput).toBeUndefined();
  });

  it('resumes a ready checkout without creating another checkout', async () => {
    mocks.status = { state: 'ready', orderId: 'order-1', checkoutUrl: `${window.location.origin}/checkout/resume` };
    localStorage.setItem('swelldays.checkout.v1:media-1', '11111111-1111-4111-8111-111111111111');
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => result.current.handleCheckout());

    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/checkout/resume' });
    expect(mocks.mutationInput).toBeUndefined();
  });

  it('routes a paid checkout to purchases without creating another checkout', async () => {
    mocks.status = { state: 'paid', orderId: 'order-1' };
    localStorage.setItem('swelldays.checkout.v1:media-1', '11111111-1111-4111-8111-111111111111');
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => result.current.handleCheckout());

    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/me/collections/purchases?order=order-1' });
    expect(mocks.mutationInput).toBeUndefined();
  });

  it('keeps a provider return blocked on the cart until payment is confirmed', () => {
    mocks.status = { state: 'processing', orderId: 'order-1' };

    const { result } = renderHook(() => useCartCheckout('order-1'));

    expect(mocks.statusQueryInput).toEqual({ orderId: 'order-1' });
    expect(result.current.isPending).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not leave the cart until the buyer acknowledges a server-confirmed purchase', async () => {
    mocks.status = { state: 'paid', orderId: 'order-1' };

    const { result } = renderHook(() => useCartCheckout('order-1'));

    await waitFor(() => expect(mocks.statusQueryInput).toEqual({ orderId: 'order-1' }));
    expect(result.current.isPending).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('replaces only the current cart key on explicit retry from failed', async () => {
    mocks.status = { state: 'failed', orderId: 'order-1', reason: 'order-failed' };
    const oldId = '11111111-1111-4111-8111-111111111111';
    localStorage.setItem('swelldays.checkout.v1:media-1', oldId);
    localStorage.setItem('swelldays.checkout.v1:other-media', '22222222-2222-4222-8222-222222222222');
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => result.current.handleCheckout());

    expect(mocks.mutationInput?.clientRequestId).not.toBe(oldId);
    expect(localStorage.getItem('swelldays.checkout.v1:other-media')).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('mints a new clientRequestId when the cart items change', async () => {
    const { result, rerender } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });
    const firstId = mocks.mutationInput?.clientRequestId;
    const firstStorageKey = Object.keys(localStorage).find((key) => key.startsWith('swelldays.checkout.v1:'));

    act(() => {
      useCartStore.setState({ items: [{ ...item, id: 'media-2' }] });
    });
    rerender();

    await act(async () => {
      result.current.handleCheckout();
    });
    const secondId = mocks.mutationInput?.clientRequestId;

    expect(secondId).toBeDefined();
    expect(secondId).not.toBe(firstId);
    expect(firstStorageKey).toBeDefined();
    expect(localStorage.getItem(firstStorageKey ?? '')).toBe(firstId);
  });

  it('uses the same persisted key for the same cart in a different item order', async () => {
    const secondItem = { ...item, id: 'media-2' };
    useCartStore.setState({ items: [item, secondItem] });
    const first = renderHook(() => useCartCheckout());
    await act(async () => first.result.current.handleCheckout());
    const firstId = mocks.mutationInput?.clientRequestId;
    first.unmount();

    useCartStore.setState({ items: [secondItem, item] });
    const second = renderHook(() => useCartCheckout());
    await act(async () => second.result.current.handleCheckout());

    expect(mocks.mutationInput?.clientRequestId).toBe(firstId);
  });

  it('preserves the clientRequestId after a transport failure', async () => {
    mocks.shouldError = true;
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });
    const firstId = mocks.mutationInput?.clientRequestId;

    mocks.shouldError = false;
    await act(async () => {
      result.current.handleCheckout();
    });
    const secondId = mocks.mutationInput?.clientRequestId;

    expect(secondId).toBeDefined();
    expect(secondId).toBe(firstId);
    expect(mocks.refetchStatus).toHaveBeenCalled();
    expect(mocks.notifyError).toHaveBeenCalledWith(
      'Checkout response was interrupted. Checking your payment status…',
      'Checkout interrupted',
    );
  });

  it('surfaces an own-media rejection without treating it as an interrupted payment', async () => {
    const ownedId = '11111111-1111-4111-8111-111111111111';
    mocks.shouldError = true;
    mocks.mutationError = {
      data: {
        details: {
          reason: 'own-media',
          mediaItemIds: [ownedId],
        },
      },
    };
    useCartStore.setState({ items: [{ ...item, id: ownedId }] });
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    expect(result.current.selfPurchaseItemIds).toEqual([ownedId]);
    expect(mocks.refetchStatus).not.toHaveBeenCalled();
    expect(mocks.notifyError).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(false);
  });

  it('removes only rejected own-media items and preserves valid cart items', async () => {
    const ownedId = '11111111-1111-4111-8111-111111111111';
    const validId = '22222222-2222-4222-8222-222222222222';
    mocks.shouldError = true;
    mocks.mutationError = {
      data: {
        details: {
          reason: 'own-media',
          mediaItemIds: [ownedId],
        },
      },
    };
    useCartStore.setState({ items: [{ ...item, id: ownedId }, { ...item, id: validId }] });
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });
    act(() => {
      result.current.removeSelfPurchaseItems();
    });

    expect(useCartStore.getState().items.map(({ id }) => id)).toEqual([validId]);
    expect(result.current.selfPurchaseItemIds).toEqual([]);
  });

  it('reports a definitive checkout rejection after confirming failed server state', async () => {
    mocks.shouldError = true;
    mocks.refetchStatus.mockResolvedValue({
      data: { state: 'failed', orderId: 'order-1', reason: 'provider-rejected' } satisfies BuyerCheckoutStatus,
    });
    const { result } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith(
        'Checkout could not be started. Please try again.',
        'Checkout failed',
      );
    });
  });
});
