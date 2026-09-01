import { useInfiniteQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import { EMPTY_BROWSE_FILTERS, toBrowseDateRange, type BrowseFilters } from 'shared/model/browseFilters';

interface SessionFeedParams {
  spotId?: string | null;
  filters?: BrowseFilters;
  limit?: number;
}

type TRPCOptionsProxy = ReturnType<typeof useTRPC>;

export function sessionFeedInfiniteQueryOptions(
  trpc: TRPCOptionsProxy,
  { spotId, filters = EMPTY_BROWSE_FILTERS, limit = 20 }: SessionFeedParams = {},
) {
  const dateRange = toBrowseDateRange(filters.date);

  return trpc.sessions.list.infiniteQueryOptions(
    { limit, spotId: spotId ?? undefined, ...dateRange, favoritesOnly: filters.favoriteSpotsOnly },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );
}

export function useSessionFeed(params: SessionFeedParams = {}) {
  const trpc = useTRPC();
  return useInfiniteQuery(sessionFeedInfiniteQueryOptions(trpc, params));
}
