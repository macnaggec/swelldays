import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAddSpotAlias } from './useAddSpotAlias';
import { useCreateSpot } from './useCreateSpot';

const createdSpot = {
  id: 'spot-1',
  name: 'Pipeline',
  location: 'Oahu',
  coords: { lat: 21.665, lng: -158.052 },
  status: 'UNVERIFIED' as const,
};

function queryKey(path: string[], input?: unknown) {
  return [
    path,
    {
      ...(input !== undefined ? { input } : {}),
      type: 'query',
    },
  ];
}

function queryEndpoint(path: string[]) {
  return {
    pathFilter: () => ({ queryKey: [path] }),
    queryKey: (input?: unknown) => queryKey(path, input),
  };
}

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    spots: {
      create: {
        mutationOptions: (options?: object) => ({
          mutationFn: async () => createdSpot,
          ...options,
        }),
      },
      addAlias: {
        mutationOptions: (options?: object) => ({
          mutationFn: async () => ({ ok: true }),
          ...options,
        }),
      },
      list: queryEndpoint(['spots', 'list']),
      withinBounds: queryEndpoint(['spots', 'withinBounds']),
    },
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function seedSpotCollections(queryClient: QueryClient) {
  const keys = {
    list: queryKey(['spots', 'list']),
    search: queryKey(['spots', 'list'], 'pipe'),
    worldMap: queryKey(['spots', 'withinBounds'], {
      swLat: -90,
      swLng: -180,
      neLat: 90,
      neLng: 180,
    }),
    localMap: queryKey(['spots', 'withinBounds'], {
      swLat: 20,
      swLng: -159,
      neLat: 22,
      neLng: -157,
    }),
  };

  for (const key of Object.values(keys)) {
    queryClient.setQueryData(key, []);
  }

  return keys;
}

function expectInvalidated(queryClient: QueryClient, queryKey: unknown[]) {
  expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true);
}

function expectFresh(queryClient: QueryClient, queryKey: unknown[]) {
  expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(false);
}

describe('Spot mutation cache invalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('invalidates every list, search, and map projection after creating a spot', async () => {
    const keys = seedSpotCollections(queryClient);
    const { result } = renderHook(() => useCreateSpot(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        name: createdSpot.name,
        location: createdSpot.location,
        lat: createdSpot.coords.lat,
        lng: createdSpot.coords.lng,
      });
    });

    expectInvalidated(queryClient, keys.list);
    expectInvalidated(queryClient, keys.search);
    expectInvalidated(queryClient, keys.worldMap);
    expectInvalidated(queryClient, keys.localMap);
  });

  it('invalidates every list and search projection after adding an alias without refreshing maps', async () => {
    const keys = seedSpotCollections(queryClient);
    const { result } = renderHook(() => useAddSpotAlias(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ spotId: createdSpot.id, alias: 'Pipe' });
    });

    expectInvalidated(queryClient, keys.list);
    expectInvalidated(queryClient, keys.search);
    expectFresh(queryClient, keys.worldMap);
    expectFresh(queryClient, keys.localMap);
  });
});
