import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mediaDateIndexQueryOptions, spotMediaFeedInfiniteQueryOptions, useSpotMediaFeed } from './useSpotMediaFeed';
import { useTRPC } from 'shared/lib/trpc';

const mocks = vi.hoisted(() => ({
  infiniteQueryOptions: vi.fn((
    _input: unknown,
    _pagination: {
      getNextPageParam: (lastPage: { nextCursor: string | null }) => string | undefined;
      getPreviousPageParam: (firstPage: { prevCursor: string | null }) => string | undefined;
    },
  ) => ({ queryKey: ['spots', 'mediaFeed'] })),
  dateIndexQueryOptions: vi.fn((_input: unknown) => ({ queryKey: ['spots', 'mediaDateIndex'] })),
  useInfiniteQuery: vi.fn(() => ({ data: undefined })),
  useQuery: vi.fn(() => ({ data: [new Date('2026-07-10T12:00:00.000Z')], isLoading: false })),
}));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: mocks.useInfiniteQuery,
  useQuery: mocks.useQuery,
}));
vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    spots: {
      mediaFeed: { infiniteQueryOptions: mocks.infiniteQueryOptions },
      mediaDateIndex: { queryOptions: mocks.dateIndexQueryOptions },
    },
  }),
}));

describe('useSpotMediaFeed', () => {
  it('sends one shared browse scope to the paginated feed and complete date index', () => {
    const date = new Date(2026, 6, 10, 12);

    const { result } = renderHook(() => useSpotMediaFeed({
      spotId: 'spot-1',
      filters: { date: { date }, favoriteSpotsOnly: true },
    }));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      {
        spotId: 'spot-1',
        limit: 30,
        sortOrder: 'desc',
        dateFrom: new Date(2026, 6, 10),
        dateTo: new Date(2026, 6, 11),
        favoriteSpotsOnly: true,
        anchorCapturedAt: undefined,
      },
      { getNextPageParam: expect.any(Function), getPreviousPageParam: expect.any(Function) },
    );
    expect(mocks.dateIndexQueryOptions).toHaveBeenCalledWith({
      spotId: 'spot-1',
      sortOrder: 'desc',
      dateFrom: new Date(2026, 6, 10),
      dateTo: new Date(2026, 6, 11),
      favoriteSpotsOnly: true,
    });
    expect(result.current.availableDates).toEqual([
      new Date('2026-07-10T12:00:00.000Z'),
    ]);
  });

  it('passes jumpAnchor through as anchorCapturedAt, seeding only the first page of a fresh query', () => {
    const anchor = new Date('2026-05-01T00:00:00.000Z');

    renderHook(() => useSpotMediaFeed({ spotId: 'spot-1', jumpAnchor: anchor }));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ anchorCapturedAt: anchor }),
      expect.anything(),
    );
  });

  it('produces identical infiniteQueryOptions/dateIndexQueryOptions calls from the factories directly and from the hook', () => {
    const date = new Date(2026, 6, 10, 12);
    const params = {
      spotId: 'spot-1',
      filters: { date: { date }, favoriteSpotsOnly: true },
    };
    const expectedFeedInput = {
      spotId: 'spot-1',
      limit: 30,
      sortOrder: 'desc' as const,
      dateFrom: new Date(2026, 6, 10),
      dateTo: new Date(2026, 6, 11),
      favoriteSpotsOnly: true,
      anchorCapturedAt: undefined,
    };
    const expectedDateIndexInput = {
      spotId: 'spot-1',
      sortOrder: 'desc' as const,
      dateFrom: new Date(2026, 6, 10),
      dateTo: new Date(2026, 6, 11),
      favoriteSpotsOnly: true,
    };

    const { result: trpcResult } = renderHook(() => useTRPC());

    spotMediaFeedInfiniteQueryOptions(trpcResult.current, params);
    mediaDateIndexQueryOptions(trpcResult.current, params);

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expectedFeedInput,
      { getNextPageParam: expect.any(Function), getPreviousPageParam: expect.any(Function) },
    );
    expect(mocks.dateIndexQueryOptions).toHaveBeenCalledWith(expectedDateIndexInput);

    const factoryPagination = mocks.infiniteQueryOptions.mock.calls.at(-1)?.[1];
    expect(factoryPagination?.getNextPageParam({ nextCursor: 'next-cursor' })).toBe('next-cursor');
    expect(factoryPagination?.getNextPageParam({ nextCursor: null })).toBeUndefined();
    expect(factoryPagination?.getPreviousPageParam({ prevCursor: 'prev-cursor' })).toBe('prev-cursor');
    expect(factoryPagination?.getPreviousPageParam({ prevCursor: null })).toBeUndefined();

    mocks.infiniteQueryOptions.mockClear();
    mocks.dateIndexQueryOptions.mockClear();

    renderHook(() => useSpotMediaFeed(params));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expectedFeedInput,
      { getNextPageParam: expect.any(Function), getPreviousPageParam: expect.any(Function) },
    );
    expect(mocks.dateIndexQueryOptions).toHaveBeenCalledWith(expectedDateIndexInput);

    const hookPagination = mocks.infiniteQueryOptions.mock.calls[0]?.[1];
    expect(hookPagination?.getNextPageParam({ nextCursor: 'next-cursor' })).toBe('next-cursor');
    expect(hookPagination?.getNextPageParam({ nextCursor: null })).toBeUndefined();
    expect(hookPagination?.getPreviousPageParam({ prevCursor: 'prev-cursor' })).toBe('prev-cursor');
    expect(hookPagination?.getPreviousPageParam({ prevCursor: null })).toBeUndefined();
  });

  it('keeps jumpAnchor scoped to the feed factory only, matching hook and direct factory calls', () => {
    const anchor = new Date('2026-05-01T00:00:00.000Z');
    const params = { spotId: 'spot-1', jumpAnchor: anchor };

    const { result: trpcResult } = renderHook(() => useTRPC());

    spotMediaFeedInfiniteQueryOptions(trpcResult.current, params);
    mediaDateIndexQueryOptions(trpcResult.current, params);

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ anchorCapturedAt: anchor }),
      expect.anything(),
    );
    expect(mocks.dateIndexQueryOptions.mock.calls.at(-1)?.[0]).not.toHaveProperty('anchorCapturedAt');

    mocks.infiniteQueryOptions.mockClear();
    mocks.dateIndexQueryOptions.mockClear();

    renderHook(() => useSpotMediaFeed(params));

    expect(mocks.infiniteQueryOptions).toHaveBeenCalledWith(
      expect.objectContaining({ anchorCapturedAt: anchor }),
      expect.anything(),
    );
    expect(mocks.dateIndexQueryOptions.mock.calls.at(-1)?.[0]).not.toHaveProperty('anchorCapturedAt');
  });
});
