import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useCreateSpot() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.spots.create.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.spots.list.pathFilter()),
          queryClient.invalidateQueries(trpc.spots.withinBounds.pathFilter()),
        ]);
      },
    }),
  );
}
