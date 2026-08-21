import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUploadManager, type UploadWorkspaceSeed } from './useUploadManager';
import { useUploadStore } from './uploadStore';

const mocks = vi.hoisted(() => ({
  cancelWorkspace: vi.fn(),
  deleteWorkspaceAsset: vi.fn(),
  discardAttempt: vi.fn(),
  notifyError: vi.fn(),
  revokeBlobUrl: vi.fn(),
  stageMediaRemoval: vi.fn(),
  startNewWorkspace: vi.fn(),
  startLocalUpload: vi.fn(),
  startDriveUpload: vi.fn(),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      startNewWorkspace: { mutationOptions: (options?: object) => options ?? {} },
    },
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: mocks.startNewWorkspace }),
}));

vi.mock('./useUploadCommands', () => ({
  useUploadCommands: () => ({
    cancelWorkspace: mocks.cancelWorkspace,
    deleteWorkspaceAsset: mocks.deleteWorkspaceAsset,
    discard: mocks.discardAttempt,
    stageMediaRemoval: mocks.stageMediaRemoval,
  }),
}));

vi.mock('./uploadCoordinator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./uploadCoordinator')>();
  return {
    ...actual,
    startLocalUpload: mocks.startLocalUpload,
    startDriveUpload: mocks.startDriveUpload,
  };
});

vi.mock('./useGooglePicker', () => ({
  requestDriveAccessToken: vi.fn(),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

const seed: UploadWorkspaceSeed = {
  spotId: null,
  startsAt: null,
  endsAt: null,
  photoPrice: 300,
  videoPrice: 300,
};

async function flush(times = 3) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cancelWorkspace.mockResolvedValue(undefined);
  mocks.deleteWorkspaceAsset.mockResolvedValue(undefined);
  mocks.discardAttempt.mockResolvedValue(undefined);
  mocks.stageMediaRemoval.mockResolvedValue(undefined);
  mocks.startLocalUpload.mockResolvedValue(undefined);
  mocks.startDriveUpload.mockResolvedValue(undefined);
  mocks.startNewWorkspace.mockResolvedValue({ id: 'new-workspace' });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: mocks.revokeBlobUrl,
  });
});

afterEach(() => {
  useUploadStore.setState({ transfers: new Map() });
});

describe('useUploadManager workspace creation', () => {
  it('creates exactly one workspace for a multi-file batch and reuses it for every file', async () => {
    const onWorkspaceCreated = vi.fn();
    const { result } = renderHook(() => useUploadManager(undefined, seed, onWorkspaceCreated));

    const files = [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.jpg', { type: 'image/jpeg' }),
    ];

    await act(async () => {
      result.current.addFiles(files);
      await flush();
    });

    expect(mocks.startNewWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.startLocalUpload).toHaveBeenCalledTimes(3);
    for (const call of mocks.startLocalUpload.mock.calls) {
      expect(call[1]).toMatchObject({ workspaceId: 'new-workspace' });
    }
    expect(onWorkspaceCreated).toHaveBeenCalledWith('new-workspace');
  });

  it('skips workspace creation when a workspace already exists', async () => {
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      result.current.addFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
      await flush();
    });

    expect(mocks.startNewWorkspace).not.toHaveBeenCalled();
    expect(mocks.startLocalUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: 'workspace-1' }),
    );
  });

  it('clears the pending creation after a failure so the next drop can retry', async () => {
    mocks.startNewWorkspace.mockRejectedValueOnce(new Error('network down'));
    mocks.startNewWorkspace.mockResolvedValueOnce({ id: 'retry-workspace' });
    const { result } = renderHook(() => useUploadManager(undefined, seed));

    await act(async () => {
      result.current.addFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })]);
      await flush();
    });
    expect(mocks.notifyError).toHaveBeenCalledOnce();
    expect(mocks.startLocalUpload).not.toHaveBeenCalled();

    await act(async () => {
      result.current.addFiles([new File(['b'], 'b.jpg', { type: 'image/jpeg' })]);
      await flush();
    });

    expect(mocks.startNewWorkspace).toHaveBeenCalledTimes(2);
    expect(mocks.startLocalUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workspaceId: 'retry-workspace' }),
    );
  });
});

describe('useUploadManager removal dispatch', () => {
  it('stages existing media removal through the workspace API', async () => {
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      await result.current.remove('existing', 'media-1');
    });

    expect(mocks.stageMediaRemoval).toHaveBeenCalledWith({ workspaceId: 'workspace-1', mediaItemId: 'media-1' });
    expect(mocks.deleteWorkspaceAsset).not.toHaveBeenCalled();
  });

  it('deletes new workspace assets through the workspace API', async () => {
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      await result.current.remove('asset', 'asset-1');
    });

    expect(mocks.deleteWorkspaceAsset).toHaveBeenCalledWith({ workspaceId: 'workspace-1', assetId: 'asset-1' });
    expect(mocks.stageMediaRemoval).not.toHaveBeenCalled();
  });

  it('releases browser resources and discards an upload-attempt card', async () => {
    const abort = vi.fn();
    useUploadStore.getState().addTransfer({
      source: 'local',
      clientRequestId: 'request-1',
      attemptId: 'attempt-1',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:preview-1',
      resourceType: 'image',
      progress: 50,
      abort,
    });
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      await result.current.remove('attempt', 'attempt-1');
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(mocks.revokeBlobUrl).toHaveBeenCalledWith('blob:preview-1');
    expect(mocks.discardAttempt).toHaveBeenCalledWith({ attemptId: 'attempt-1' });
    expect(useUploadStore.getState().getAll()).toEqual([]);
  });

  it('notifies and keeps the card when server discard fails', async () => {
    const abort = vi.fn();
    mocks.discardAttempt.mockRejectedValueOnce(new Error('network down'));
    useUploadStore.getState().addTransfer({
      source: 'local',
      clientRequestId: 'request-1',
      attemptId: 'attempt-1',
      file: new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
      previewUrl: 'blob:preview-1',
      resourceType: 'image',
      progress: 50,
      abort,
    });
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      await result.current.remove('attempt', 'attempt-1');
    });

    expect(abort).toHaveBeenCalledOnce();
    expect(mocks.revokeBlobUrl).not.toHaveBeenCalled();
    expect(useUploadStore.getState().getAll()).toHaveLength(1);
    expect(mocks.notifyError).toHaveBeenCalledWith('network down', 'Delete Failed');
  });
});

describe('useUploadManager cancel', () => {
  it('cancels the active workspace', async () => {
    const { result } = renderHook(() => useUploadManager('workspace-1', seed));

    await act(async () => {
      await result.current.discardAll();
    });

    expect(mocks.cancelWorkspace).toHaveBeenCalledWith({ workspaceId: 'workspace-1' });
  });
});
