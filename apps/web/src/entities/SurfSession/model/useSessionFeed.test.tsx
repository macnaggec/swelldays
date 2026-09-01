import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionFeedInfiniteQueryOptions, useSessionFeed } from './useSessionFeed';
import { useTRPC } from 'shared/lib/trpc';
import { toBrowseDateRange } from 'shared/model/browseFilters';

const mocks = vi.hoisted(() => ({
  infiniteQueryOptions: vi.fn((
    _input: unknown,
    _pagination: {
      getNextPageParam: (last: { nextCursor: string | null }) => string | undefined;
    },
  ) => ({ queryKey: ['sessions', 'list'] })),
  useInfiniteQuery: vi.fn(() => ({})),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useInfiniteQuery: mocks.useInfiniteQuery,
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    sessions: {
      list: {
        infiniteQueryOptions: mocks.infiniteQueryOptions,
      },
    },
  }),
}));

describe('useSessionFeed', () => {
  beforeEach(() => {
    mocks.infiniteQueryOptions.mockClear();
    mocks.useInfiniteQuery.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('includes today and the previous six calendar days for the last seven days filter', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 20, 15, 30));

    expect(toBrowseDateRange('last7')).toEqual({
      dateFrom: new Date(2026, 5, 14),
      dateTo: new Date(2026, 5, 21),
    });
  });

  it('owns the spot and custom-date query contract', () => {
    const selectedDate = new Date(2026, 4, 3, 12, 15);

    renderHook(() => useSessionFeed({
      spotId: 'adca9ad6-f886-4f19-bb64-64c092873c59',
      filters: { date: { date: selectedDate }, favoriteSpotsOnly: true },
    }));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      {
        limit: 20,
        spotId: 'adca9ad6-f886-4f19-bb64-64c092873c59',
        dateFrom: new Date(2026, 4, 3),
        dateTo: new Date(2026, 4, 4),
        favoritesOnly: true,
      },
      { getNextPageParam: expect.any(Function) },
    );

    const pagination = mocks.infiniteQueryOptions.mock.calls[0]?.[1];
    expect(pagination?.getNextPageParam({ nextCursor: 'next-session' })).toBe('next-session');
    expect(pagination?.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });

  it('produces the identical infiniteQueryOptions call from the factory directly and from the hook', () => {
    const selectedDate = new Date(2026, 4, 3, 12, 15);
    const params = {
      spotId: 'adca9ad6-f886-4f19-bb64-64c092873c59',
      filters: { date: { date: selectedDate }, favoriteSpotsOnly: true },
    };
    const expectedInput = {
      limit: 20,
      spotId: 'adca9ad6-f886-4f19-bb64-64c092873c59',
      dateFrom: new Date(2026, 4, 3),
      dateTo: new Date(2026, 4, 4),
      favoritesOnly: true,
    };

    const { result: trpcResult } = renderHook(() => useTRPC());

    sessionFeedInfiniteQueryOptions(trpcResult.current, params);

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expectedInput,
      { getNextPageParam: expect.any(Function) },
    );

    const factoryPagination = mocks.infiniteQueryOptions.mock.calls[0]?.[1];
    expect(factoryPagination?.getNextPageParam({ nextCursor: 'next-session' })).toBe('next-session');
    expect(factoryPagination?.getNextPageParam({ nextCursor: null })).toBeUndefined();

    mocks.infiniteQueryOptions.mockClear();

    renderHook(() => useSessionFeed(params));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expectedInput,
      { getNextPageParam: expect.any(Function) },
    );

    const hookPagination = mocks.infiniteQueryOptions.mock.calls[0]?.[1];
    expect(hookPagination?.getNextPageParam({ nextCursor: 'next-session' })).toBe('next-session');
    expect(hookPagination?.getNextPageParam({ nextCursor: null })).toBeUndefined();
  });
});
