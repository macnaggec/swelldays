import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useUpdateSpot() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.admin.spots.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.spots.list.pathFilter()),
          queryClient.invalidateQueries(trpc.spots.byId.pathFilter()),
          queryClient.invalidateQueries(trpc.spots.withinBounds.pathFilter()),
        ]);
      },
    }),
  );
}
