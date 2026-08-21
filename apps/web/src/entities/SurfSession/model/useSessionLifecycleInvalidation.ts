import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

export function useSessionLifecycleInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useCallback(async function invalidateSessionLifecycle(sessionId: string) {
    await Promise.all([
      queryClient.invalidateQueries(trpc.sessions.list.pathFilter()),
      queryClient.invalidateQueries(trpc.sessions.mine.queryFilter()),
      queryClient.invalidateQueries(trpc.sessions.byId.queryFilter(sessionId)),
      queryClient.invalidateQueries(trpc.sessions.media.queryFilter(sessionId)),
      queryClient.invalidateQueries(trpc.users.myUploads.queryFilter()),
      queryClient.invalidateQueries(trpc.users.myDraftCounts.queryFilter()),
      queryClient.invalidateQueries(trpc.media.myDrafts.queryFilter()),
    ]);
  }, [queryClient, trpc]);
}
