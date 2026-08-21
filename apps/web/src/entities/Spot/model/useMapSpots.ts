import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import type { MapBounds } from '../types';

/** Fetches spots within the given viewport bounds for globe/map rendering. */
export function useMapSpots(bounds: MapBounds) {
  const trpc = useTRPC();
  return useQuery(trpc.spots.withinBounds.queryOptions(bounds));
}
