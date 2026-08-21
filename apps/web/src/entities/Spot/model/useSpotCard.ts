import { useQuery } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/** Spot card data for the globe popup — name, location, up to 5 media items, total count. */
export function useSpotCard(spotId: string | null | undefined) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.spots.card.queryOptions(spotId ?? ''),
    enabled: !!spotId,
  });
}
