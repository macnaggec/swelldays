import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useAuthModal } from 'entities/Identity';
import { useUser } from 'shared/hooks/useUser';
import { useTRPC } from 'shared/lib/trpc';
import type { PublicMedia } from 'entities/Media/types';

export function useMediaFavorites() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();
  const idsKey = trpc.media.favoriteIds.queryKey();
  const favoritesKey = trpc.media.favorites.queryKey();
  const [optimisticItems] = useState(() => new Map<string, PublicMedia>());

  const { data: ids = [], isLoading } = useQuery({
    ...trpc.media.favoriteIds.queryOptions(),
    enabled: isAuthenticated,
  });

  const mutation = useMutation(trpc.media.setFavorite.mutationOptions({
    onMutate: async ({ mediaItemId, favorited }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: idsKey }),
        queryClient.cancelQueries({ queryKey: favoritesKey }),
      ]);
      const previousIds = queryClient.getQueryData<string[]>(idsKey);
      const previousFavorites = queryClient.getQueryData<PublicMedia[]>(favoritesKey);

      queryClient.setQueryData<string[]>(idsKey, (current = []) =>
        favorited
          ? [mediaItemId, ...current.filter((id) => id !== mediaItemId)]
          : current.filter((id) => id !== mediaItemId));
      const item = optimisticItems.get(mediaItemId);
      queryClient.setQueryData<PublicMedia[]>(favoritesKey, (current = []) =>
        favorited && item
          ? [item, ...current.filter((favorite) => favorite.id !== mediaItemId)]
          : current.filter((favorite) => favorite.id !== mediaItemId));

      return { previousIds, previousFavorites };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousIds !== undefined) queryClient.setQueryData(idsKey, context.previousIds);
      if (context?.previousFavorites !== undefined) queryClient.setQueryData(favoritesKey, context.previousFavorites);
      notifications.show({ color: 'red', message: 'Could not update favorites. Please try again.' });
    },
    onSettled: async (_data, _error, variables) => {
      optimisticItems.delete(variables.mediaItemId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: idsKey }),
        queryClient.invalidateQueries({ queryKey: favoritesKey }),
      ]);
    },
  }));

  const favoriteIds = new Set(ids);
  const toggleFavorite = (item: PublicMedia) => {
    const favorited = !favoriteIds.has(item.id);
    const submit = () => {
      optimisticItems.set(item.id, item);
      mutation.mutate({ mediaItemId: item.id, favorited });
    };
    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: submit });
      return;
    }
    submit();
  };

  return { favoriteIds, toggleFavorite, isLoading, isPending: mutation.isPending };
}
