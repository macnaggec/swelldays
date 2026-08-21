import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/** Fetches spots, optionally filtered by search string. Pass enabled:false to suppress until ready. */
export function useSpots(search?: string, options?: { enabled?: boolean }) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.spots.list.queryOptions(search), ...options });
}
