import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from './cartStore';
import { useCartCheckout } from './useCartCheckout';
import type { CartItem } from './types';

const mocks = vi.hoisted(() => ({
  mutationInput: undefined as { itemIds: string[]; clientRequestId: string } | undefined,
  checkoutUrl: '' as string,
  navigate: vi.fn(),
  isAuthenticated: true,
  openAuthModal: vi.fn(),
  shouldError: false,
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock('entities/Identity', () => ({
  useAuthModal: () => ({ open: mocks.openAuthModal }),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useMutation: (options: {
      onSuccess?: (data: { checkoutUrl: string; orderId: string }) => void;
      onError?: (error: Error) => void;
    }) => ({
      isPending: false,
      mutate: (input: { itemIds: string[]; clientRequestId: string }) => {
        mocks.mutationInput = input;
        if (mocks.shouldError) {
          options.onError?.(new Error('Checkout failed'));
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

  it('mints a new clientRequestId when the cart items change', async () => {
    const { result, rerender } = renderHook(() => useCartCheckout());

    await act(async () => {
      result.current.handleCheckout();
    });
    const firstId = mocks.mutationInput?.clientRequestId;

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
  });

  it('mints a new clientRequestId after a failed checkout attempt', async () => {
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
    expect(secondId).not.toBe(firstId);
  });
});
