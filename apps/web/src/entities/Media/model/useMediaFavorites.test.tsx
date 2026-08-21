import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaFavorites } from './useMediaFavorites';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  openAuth: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock('entities/Identity', () => ({ useAuthModal: () => ({ open: mocks.openAuth }) }));
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }));
vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({ media: {
    favoriteIds: {
      queryOptions: () => ({ queryKey: ['media', 'favoriteIds'], queryFn: async () => [] }),
      queryKey: () => ['media', 'favoriteIds'],
    },
    favorites: { queryKey: () => ['media', 'favorites'] },
    setFavorite: { mutationOptions: (options: object) => ({ mutationFn: mocks.mutate, ...options }) },
  } }),
}));

describe('useMediaFavorites', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.openAuth.mockReset();
    mocks.mutate.mockReset().mockResolvedValue({ favorited: true });
  });

  it('opens authentication instead of mutating for a signed-out viewer', async () => {
    mocks.authenticated = false;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMediaFavorites(), { wrapper });

    act(() => result.current.toggleFavorite({ id: 'media-1' } as never));

    expect(mocks.openAuth).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('completes the favorite once the viewer signs in', async () => {
    mocks.authenticated = false;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMediaFavorites(), { wrapper });

    act(() => result.current.toggleFavorite({ id: 'media-1' } as never));

    const { onAuthenticated } = mocks.openAuth.mock.calls[0]?.[0] as { onAuthenticated: () => void };
    expect(mocks.mutate).not.toHaveBeenCalled();

    await act(async () => {
      onAuthenticated();
    });

    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({ mediaItemId: 'media-1', favorited: true }, expect.anything());
  });

  it('marks media favorited before persistence finishes', async () => {
    let resolveMutation!: (value: unknown) => void;
    mocks.mutate.mockImplementation(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMediaFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleFavorite({ id: 'media-1' } as never));

    await waitFor(() => expect(result.current.favoriteIds.has('media-1')).toBe(true));
    resolveMutation({ favorited: true });
  });

  it('restores favorite state when persistence fails', async () => {
    mocks.mutate.mockRejectedValue(new Error('offline'));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useMediaFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleFavorite({ id: 'media-1' } as never));

    await waitFor(() => expect(result.current.favoriteIds.has('media-1')).toBe(false));
  });
});
