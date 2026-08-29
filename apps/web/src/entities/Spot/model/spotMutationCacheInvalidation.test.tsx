import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCreateSpot } from './useCreateSpot';
import { useUpdateSpot } from './useUpdateSpot';

const createdSpot = {
  id: 'spot-1',
  name: 'Pipeline',
  location: 'Oahu',
  coords: { lat: 21.665, lng: -158.052 },
  status: 'UNVERIFIED' as const,
};

const updatedSpot = {
  id: 'spot-1',
  name: 'Pipeline (renamed)',
  location: 'Oahu',
  coords: { lat: 21.665, lng: -158.052 },
  status: 'VERIFIED' as const,
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
    admin: {
      spots: {
        update: {
          mutationOptions: (options?: object) => ({
            mutationFn: async () => updatedSpot,
            ...options,
          }),
        },
      },
    },
    spots: {
      create: {
        mutationOptions: (options?: object) => ({
          mutationFn: async () => createdSpot,
          ...options,
        }),
      },
      list: queryEndpoint(['spots', 'list']),
      byId: queryEndpoint(['spots', 'byId']),
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
});

describe('useUpdateSpot cache invalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('invalidates every list, search, map projection, and the spot detail after updating a spot', async () => {
    const keys = seedSpotCollections(queryClient);
    const byIdKey = queryKey(['spots', 'byId'], updatedSpot.id);
    queryClient.setQueryData(byIdKey, createdSpot);

    const { result } = renderHook(() => useUpdateSpot(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        id: updatedSpot.id,
        name: updatedSpot.name,
        location: updatedSpot.location,
        lat: updatedSpot.coords.lat,
        lng: updatedSpot.coords.lng,
      });
    });

    expectInvalidated(queryClient, keys.list);
    expectInvalidated(queryClient, keys.search);
    expectInvalidated(queryClient, keys.worldMap);
    expectInvalidated(queryClient, keys.localMap);
    expectInvalidated(queryClient, byIdKey);
  });
});
