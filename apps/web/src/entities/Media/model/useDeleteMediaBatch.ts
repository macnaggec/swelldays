import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';

export function useDeleteMediaBatch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation(
    trpc.media.deleteBatch.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: trpc.users.myUploads.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.users.myDraftCounts.queryKey() });
        void queryClient.invalidateQueries({ queryKey: trpc.media.myDrafts.queryKey() });
      },
      onError: (err, variables) => {
        notify.error(getErrorMessage(err), 'Delete Failed');
        console.error('[discardAll] Batch delete failed — potential orphaned draft IDs:', variables.ids, err);
      },
    }),
  );
}
