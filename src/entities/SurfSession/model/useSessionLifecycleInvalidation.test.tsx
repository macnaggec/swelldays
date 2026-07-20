import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionLifecycleInvalidation } from './useSessionLifecycleInvalidation';

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
    sessions: {
      list: queryEndpoint(['sessions', 'list']),
      mine: queryEndpoint(['sessions', 'mine']),
      byId: queryEndpoint(['sessions', 'byId']),
      media: queryEndpoint(['sessions', 'media']),
    },
    users: {
      myDraftCounts: queryEndpoint(['users', 'myDraftCounts']),
      myUploads: queryEndpoint(['users', 'myUploads']),
    },
    media: {
      myDrafts: queryEndpoint(['media', 'myDrafts']),
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

describe('useSessionLifecycleInvalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it('invalidates every projection derived from a session lifecycle change', async () => {
    const sessionId = 'session-1';
    const keys = {
      sessionList: queryKey(['sessions', 'list']),
      mySessions: queryKey(['sessions', 'mine']),
      session: queryKey(['sessions', 'byId'], sessionId),
      sessionMedia: queryKey(['sessions', 'media'], sessionId),
      myUploads: queryKey(['users', 'myUploads']),
      myDraftCounts: queryKey(['users', 'myDraftCounts']),
      myDrafts: queryKey(['media', 'myDrafts']),
      unrelated: queryKey(['spots', 'list']),
    };

    for (const key of Object.values(keys)) {
      queryClient.setQueryData(key, {});
    }

    const { result } = renderHook(() => useSessionLifecycleInvalidation(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await result.current(sessionId);
    });

    expectInvalidated(queryClient, keys.sessionList);
    expectInvalidated(queryClient, keys.mySessions);
    expectInvalidated(queryClient, keys.session);
    expectInvalidated(queryClient, keys.sessionMedia);
    expectInvalidated(queryClient, keys.myUploads);
    expectInvalidated(queryClient, keys.myDraftCounts);
    expectInvalidated(queryClient, keys.myDrafts);
    expect(queryClient.getQueryState(keys.unrelated)?.isInvalidated).toBe(false);
  });
});
