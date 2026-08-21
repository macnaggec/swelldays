import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTRPC } from 'shared/lib/trpc';

/** Imperative lookup of spots near a coordinate — for one-off checks (e.g. before creating a spot). */
export function useNearbySpots() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useCallback(
    (lat: number, lng: number) =>
      queryClient.fetchQuery(trpc.spots.nearby.queryOptions({ lat, lng })),
    [queryClient, trpc],
  );
}
