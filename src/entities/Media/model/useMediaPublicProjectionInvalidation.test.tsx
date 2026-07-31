import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaPublicProjectionInvalidation } from './useMediaPublicProjectionInvalidation';

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
    queryFilter: (input?: unknown) => ({ queryKey: queryKey(path, input) }),
  };
}

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    spots: {
      mediaFeed: queryEndpoint(['spots', 'mediaFeed']),
      mediaDateIndex: queryEndpoint(['spots', 'mediaDateIndex']),
    },
  }),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function expectInvalidated(queryClient: QueryClient, key: unknown[]) {
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
}

describe('useMediaPublicProjectionInvalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('invalidates the public feed and its date index together, without touching unrelated state', async () => {
    const keys = {
      mediaFeed: queryKey(['spots', 'mediaFeed'], { spotId: 'spot-1', cursor: 'abc' }),
      mediaDateIndex: queryKey(['spots', 'mediaDateIndex'], { spotId: 'spot-1' }),
      unrelated: queryKey(['spots', 'list']),
    };

    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, {});
    }

    const { result } = renderHook(() => useMediaPublicProjectionInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current();
    });

    expectInvalidated(queryClient, keys.mediaFeed);
    expectInvalidated(queryClient, keys.mediaDateIndex);
    expect(queryClient.getQueryState(keys.unrelated)?.isInvalidated).toBe(false);
  });
});
