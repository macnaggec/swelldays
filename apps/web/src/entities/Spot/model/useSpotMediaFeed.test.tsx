import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSpotMediaFeed } from './useSpotMediaFeed';

const mocks = vi.hoisted(() => ({
  infiniteQueryOptions: vi.fn(() => ({ queryKey: ['spots', 'mediaFeed'] })),
  dateIndexQueryOptions: vi.fn(() => ({ queryKey: ['spots', 'mediaDateIndex'] })),
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
});
