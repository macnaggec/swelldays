import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/** Refreshes the public gallery feed and its date-jump index together. */
export function useMediaPublicProjectionInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(async function invalidateMediaPublicProjection() {
    await Promise.all([
      queryClient.invalidateQueries(trpc.spots.mediaFeed.pathFilter()),
      queryClient.invalidateQueries(trpc.spots.mediaDateIndex.pathFilter()),
    ]);
  }, [queryClient, trpc]);
}
