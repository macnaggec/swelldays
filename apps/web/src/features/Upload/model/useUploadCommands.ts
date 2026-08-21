import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from 'shared/lib/trpc';

/**
 * All tRPC mutations and Query wiring for the upload workspace lifecycle.
 * The coordinator receives these as plain async functions — no tRPC imports needed there.
 */
export function useUploadCommands(workspaceId: string | undefined) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidateWorkspaceState = (targetWorkspaceId = workspaceId) => {
    if (!targetWorkspaceId) return Promise.resolve();
    return queryClient.invalidateQueries({
      queryKey: trpc.uploads.getWorkspaceState.queryKey({ workspaceId: targetWorkspaceId }),
    });
  };

  const invalidateActiveWorkspace = () =>
    queryClient.invalidateQueries({ queryKey: trpc.uploads.getActiveWorkspace.queryKey() });

  const invalidateUploadShell = () => Promise.all([
    invalidateWorkspaceState(),
    invalidateActiveWorkspace(),
    queryClient.invalidateQueries({ queryKey: trpc.users.myDraftCounts.queryKey() }),
    queryClient.invalidateQueries({ queryKey: trpc.media.myDrafts.queryKey() }),
  ]);

  const beginLocal = useMutation(
    trpc.uploads.beginLocal.mutationOptions()
  ).mutateAsync;

  const finalizeLocal = useMutation(
    trpc.uploads.finalizeLocal.mutationOptions({
      onSuccess: () => { void invalidateUploadShell(); },
    })
  ).mutateAsync;

  const beginDrive = useMutation(
    trpc.uploads.beginDrive.mutationOptions()
  ).mutateAsync;

  const processDrive = useMutation(
    trpc.uploads.processDrive.mutationOptions({
      onSuccess: () => { void invalidateUploadShell(); },
      onError: () => { void invalidateWorkspaceState(); },
    })
  ).mutateAsync;

  const discard = useMutation(trpc.uploads.discard.mutationOptions({
    onSuccess: () => { void invalidateWorkspaceState(); },
  })).mutateAsync;

  const cancelWorkspace = useMutation(trpc.uploads.cancelWorkspace.mutationOptions({
    onSuccess: () => {
      queryClient.setQueryData(trpc.uploads.getActiveWorkspace.queryKey(), null);
      void invalidateUploadShell();
    },
  })).mutateAsync;

  const stageMediaRemoval = useMutation(trpc.uploads.stageMediaRemoval.mutationOptions({
    onSuccess: () => { void invalidateWorkspaceState(); },
  })).mutateAsync;

  const unstageMediaRemoval = useMutation(trpc.uploads.unstageMediaRemoval.mutationOptions({
    onSuccess: () => { void invalidateWorkspaceState(); },
  })).mutateAsync;

  const deleteWorkspaceAsset = useMutation(trpc.uploads.deleteWorkspaceAsset.mutationOptions({
    onSuccess: () => { void invalidateUploadShell(); },
  })).mutateAsync;

  return {
    beginLocal,
    finalizeLocal,
    beginDrive,
    processDrive,
    discard,
    cancelWorkspace,
    stageMediaRemoval,
    unstageMediaRemoval,
    deleteWorkspaceAsset,
    invalidateWorkspaceState,
  };
}

export type UploadCommands = ReturnType<typeof useUploadCommands>;
