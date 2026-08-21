import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';
import { useMediaPublicProjectionInvalidation } from 'entities/Media';
import { useSessionLifecycleInvalidation } from './useSessionLifecycleInvalidation';

export function useStartSessionEdit() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidateSessionLifecycle = useSessionLifecycleInvalidation();
  const invalidateMediaPublicProjection = useMediaPublicProjectionInvalidation();

  return useMutation(
    trpc.uploads.startSessionEdit.mutationOptions({
      onSuccess: async (workspace, sessionId) => {
        await Promise.all([
          invalidateSessionLifecycle(sessionId),
          invalidateMediaPublicProjection(),
          queryClient.invalidateQueries(trpc.uploads.getActiveWorkspace.queryFilter()),
          queryClient.invalidateQueries(trpc.uploads.getWorkspaceState.queryFilter({ workspaceId: workspace.id })),
        ]);
      },
    }),
  );
}

export function useRetireSurfSession() {
  const trpc = useTRPC();
  const invalidateSessionLifecycle = useSessionLifecycleInvalidation();
  const invalidateMediaPublicProjection = useMediaPublicProjectionInvalidation();

  return useMutation(
    trpc.sessions.retire.mutationOptions({
      onSuccess: async (_result, sessionId) => {
        await Promise.all([
          invalidateSessionLifecycle(sessionId),
          invalidateMediaPublicProjection(),
        ]);
      },
    }),
  );
}
