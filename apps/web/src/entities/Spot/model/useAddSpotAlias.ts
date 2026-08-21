import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useAddSpotAlias() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.spots.addAlias.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.spots.list.pathFilter());
      },
    }),
  );
}
