import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavoriteSpot } from './useFavoriteSpot';

const mocks = vi.hoisted(() => ({
  isFavorited: false,
  isAuthenticated: true,
  toggleInput: undefined as string | undefined,
  invalidated: false,
  openAuthModal: vi.fn(),
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
    useQuery: () => ({ data: mocks.isFavorited }),
    useQueryClient: () => ({
      invalidateQueries: async () => {
        mocks.invalidated = true;
      },
    }),
    useMutation: (options: { onSuccess?: () => void }) => ({
      isPending: false,
      mutate: (input: string) => {
        mocks.toggleInput = input;
        options.onSuccess?.();
      },
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    spots: {
      isFavorited: {
        queryOptions: () => ({}),
        pathFilter: () => ({ queryKey: [['spots', 'isFavorited']] }),
      },
      toggleFavorite: {
        mutationOptions: (options?: object) => ({ ...options }),
      },
      mediaFeed: {
        pathFilter: () => ({ queryKey: [['spots', 'mediaFeed']] }),
      },
    },
    sessions: {
      list: {
        pathFilter: () => ({ queryKey: [['sessions', 'list']] }),
      },
    },
  }),
}));

describe('useFavoriteSpot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFavorited = false;
    mocks.isAuthenticated = true;
    mocks.toggleInput = undefined;
    mocks.invalidated = false;
  });

  it('toggles favorite state for the given spot when authenticated', async () => {
    const { result } = renderHook(() => useFavoriteSpot('spot-1'));

    await act(async () => {
      result.current.toggleFavorite();
    });

    expect(mocks.toggleInput).toBe('spot-1');
    expect(mocks.invalidated).toBe(true);
    expect(mocks.openAuthModal).not.toHaveBeenCalled();
  });

  it('opens the auth modal and skips the mutation when unauthenticated', async () => {
    mocks.isAuthenticated = false;
    const { result } = renderHook(() => useFavoriteSpot('spot-1'));

    await act(async () => {
      result.current.toggleFavorite();
    });

    expect(mocks.openAuthModal).toHaveBeenCalledTimes(1);
    expect(mocks.toggleInput).toBeUndefined();
  });

  it('completes the favorite once the viewer signs in', async () => {
    mocks.isAuthenticated = false;
    const { result } = renderHook(() => useFavoriteSpot('spot-1'));

    await act(async () => {
      result.current.toggleFavorite();
    });

    const { onAuthenticated } = mocks.openAuthModal.mock.calls[0]?.[0] as { onAuthenticated: () => void };
    expect(mocks.toggleInput).toBeUndefined();

    await act(async () => {
      onAuthenticated();
    });

    expect(mocks.toggleInput).toBe('spot-1');
  });

  it('does nothing when no spot is selected', async () => {
    const { result } = renderHook(() => useFavoriteSpot(null));

    await act(async () => {
      result.current.toggleFavorite();
    });

    expect(mocks.toggleInput).toBeUndefined();
    expect(mocks.openAuthModal).not.toHaveBeenCalled();
  });

  it('reflects the current favorited state from the query', () => {
    mocks.isFavorited = true;
    const { result } = renderHook(() => useFavoriteSpot('spot-1'));

    expect(result.current.isFavorited).toBe(true);
  });
});
