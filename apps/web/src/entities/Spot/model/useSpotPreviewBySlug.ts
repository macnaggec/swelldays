import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/** Fetches minimal spot data by its URL slug — for use with a $spotId route param, which holds a slug, not a database id. */
export function useSpotPreviewBySlug(slug: string, options?: { enabled?: boolean }) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.spots.bySlug.queryOptions(slug), ...options });
}
