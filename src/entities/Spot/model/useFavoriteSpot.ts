import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'entities/Identity';

/** Favorite state + toggle for a single spot — used by the map's selected-spot popup. */
export function useFavoriteSpot(spotId: string | null) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();

  const { data: isFavorited = false } = useQuery({
    ...trpc.spots.isFavorited.queryOptions(spotId ?? ''),
    enabled: !!spotId && isAuthenticated,
  });

  const toggle = useMutation(
    trpc.spots.toggleFavorite.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.spots.isFavorited.pathFilter()),
          queryClient.invalidateQueries(trpc.sessions.list.pathFilter()),
          queryClient.invalidateQueries(trpc.spots.mediaFeed.pathFilter()),
        ]);
      },
    }),
  );

  const toggleFavorite = () => {
    if (!spotId) return;

    const submit = () => toggle.mutate(spotId);

    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: submit });
      return;
    }

    submit();
  };

  return { isFavorited, toggleFavorite, isPending: toggle.isPending };
}
