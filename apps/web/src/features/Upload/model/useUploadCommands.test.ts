import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadCommands } from './useUploadCommands';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

function queryKey(path: string) {
  return (input?: unknown) => [path, input];
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
    setQueryData: mocks.setQueryData,
  }),
  useMutation: (options: { onSuccess?: (data: unknown, variables: unknown) => unknown }) => ({
    mutateAsync: async (variables: unknown) => {
      await options.onSuccess?.(undefined, variables);
      return undefined;
    },
    isPending: false,
  }),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      getActiveWorkspace: { queryKey: queryKey('uploads.getActiveWorkspace') },
      getWorkspaceState: { queryKey: queryKey('uploads.getWorkspaceState') },
      beginLocal: { mutationOptions: (options?: object) => options ?? {} },
      finalizeLocal: { mutationOptions: (options?: object) => options ?? {} },
      beginDrive: { mutationOptions: (options?: object) => options ?? {} },
      processDrive: { mutationOptions: (options?: object) => options ?? {} },
      discard: { mutationOptions: (options?: object) => options ?? {} },
      cancelWorkspace: { mutationOptions: (options?: object) => options ?? {} },
      stageMediaRemoval: { mutationOptions: (options?: object) => options ?? {} },
      unstageMediaRemoval: { mutationOptions: (options?: object) => options ?? {} },
      deleteWorkspaceAsset: { mutationOptions: (options?: object) => options ?? {} },
    },
    media: {
      myDrafts: { queryKey: queryKey('media.myDrafts') },
    },
    users: {
      myDraftCounts: { queryKey: queryKey('users.myDraftCounts') },
    },
  }),
}));

describe('useUploadCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('finalizeLocal refreshes the active workspace state', async () => {
    const { result } = renderHook(() => useUploadCommands('workspace-1'));

    await result.current.finalizeLocal({ attemptId: 'attempt-1', providerReceipt: {} });

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['uploads.getWorkspaceState', { workspaceId: 'workspace-1' }],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['uploads.getActiveWorkspace', undefined],
    });
  });

  it('refreshes a lazily created workspace by its explicit id', async () => {
    const { result } = renderHook(() => useUploadCommands(undefined));

    await result.current.invalidateWorkspaceState('workspace-lazy');

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['uploads.getWorkspaceState', { workspaceId: 'workspace-lazy' }],
    });
  });

  it('cancelWorkspace refreshes the workspace shell', async () => {
    const { result } = renderHook(() => useUploadCommands('workspace-1'));

    await result.current.cancelWorkspace({ workspaceId: 'workspace-1' });

    expect(mocks.setQueryData).toHaveBeenCalledWith(
      ['uploads.getActiveWorkspace', undefined],
      null,
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['uploads.getActiveWorkspace', undefined],
    });
  });

  it('deleteWorkspaceAsset refreshes workspace media summaries', async () => {
    const { result } = renderHook(() => useUploadCommands('workspace-1'));

    await result.current.deleteWorkspaceAsset({ workspaceId: 'workspace-1', assetId: 'asset-1' });

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['media.myDrafts', undefined],
    });
  });
});
