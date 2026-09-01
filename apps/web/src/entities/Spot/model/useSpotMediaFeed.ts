import { useMemo } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import { EMPTY_BROWSE_FILTERS, toBrowseDateRange, type BrowseFilters } from 'shared/model/browseFilters';

interface SpotMediaFeedParams {
  spotId?: string;
  filters?: BrowseFilters;
  sortOrder?: 'asc' | 'desc';
  /**
   * A distant day to start the feed from. Part of the query input, so
   * changing it starts a fresh, separately-cached anchored query — one
   * request instead of walking every page between here and there. That fresh
   * page still supports fetchNextPage (older) and fetchPreviousPage (newer,
   * back toward the present) like any other page.
   */
  jumpAnchor?: Date;
}

type TRPCOptionsProxy = ReturnType<typeof useTRPC>;

export function spotMediaFeedInfiniteQueryOptions(
  trpc: TRPCOptionsProxy,
  { spotId, filters = EMPTY_BROWSE_FILTERS, sortOrder = 'desc', jumpAnchor }: SpotMediaFeedParams = {},
) {
  const dateRange = toBrowseDateRange(filters.date);

  return trpc.spots.mediaFeed.infiniteQueryOptions(
    {
      spotId,
      limit: 30,
      sortOrder,
      ...dateRange,
      favoriteSpotsOnly: filters.favoriteSpotsOnly,
      anchorCapturedAt: jumpAnchor,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      getPreviousPageParam: (firstPage) => firstPage.prevCursor ?? undefined,
    },
  );
}

export function mediaDateIndexQueryOptions(
  trpc: TRPCOptionsProxy,
  { spotId, filters = EMPTY_BROWSE_FILTERS, sortOrder = 'desc' }: SpotMediaFeedParams = {},
) {
  const dateRange = toBrowseDateRange(filters.date);

  return trpc.spots.mediaDateIndex.queryOptions({
    spotId,
    sortOrder,
    ...dateRange,
    favoriteSpotsOnly: filters.favoriteSpotsOnly,
  });
}

/** Published media, optionally scoped to a single spot; omit spotId to browse all spots. */
export function useSpotMediaFeed(params: SpotMediaFeedParams = {}) {
  const trpc = useTRPC();

  const query = useInfiniteQuery(spotMediaFeedInfiniteQueryOptions(trpc, params));
  const dateIndexQuery = useQuery(mediaDateIndexQueryOptions(trpc, params));

  const flatItems = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    flatItems,
    dateIndex: {
      availableDates: dateIndexQuery.data ?? [],
      isLoading: dateIndexQuery.isLoading,
      isError: dateIndexQuery.isError,
      error: dateIndexQuery.error,
      refetch: dateIndexQuery.refetch,
    },
  };
}
