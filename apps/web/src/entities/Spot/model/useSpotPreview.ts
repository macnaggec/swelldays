import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/** Fetches minimal spot data for the drawer header. */
export function useSpotPreview(spotId: string, options?: { enabled?: boolean }) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.spots.byId.queryOptions(spotId), ...options });
}
