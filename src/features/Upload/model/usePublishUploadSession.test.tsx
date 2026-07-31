import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePublishUploadSession } from './usePublishUploadSession';
import type { GalleryCard } from './types';
import type { DraftMedia } from 'entities/Media';

const mocks = vi.hoisted(() => ({
  clearQueue: vi.fn(),
  saveWorkspace: vi.fn().mockResolvedValue({ id: 'session-1' }),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  notifyError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: {
    onSuccess?: (data: { id: string }, variables: { workspaceId: string }) => Promise<void> | void;
  }) => ({
    mutateAsync: async (variables: { workspaceId: string }) => {
      const result = await mocks.saveWorkspace(variables);
      await options.onSuccess?.(result, variables);
      return result;
    },
    isPending: false,
  }),
}));

function queryFilter(path: string) {
  return (input?: unknown) => ({ queryKey: [path, input] });
}

function pathFilter(path: string) {
  return () => ({ queryKey: [path] });
}

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      saveWorkspace: { mutationOptions: (options?: object) => options ?? {} },
      getActiveWorkspace: { queryFilter: queryFilter('uploads.getActiveWorkspace') },
      getWorkspaceState: { queryFilter: queryFilter('uploads.getWorkspaceState') },
    },
    sessions: {
      list: { pathFilter: () => ({ queryKey: ['sessions.list'] }) },
      mine: { queryFilter: queryFilter('sessions.mine') },
      byId: { queryFilter: queryFilter('sessions.byId') },
      media: { queryFilter: queryFilter('sessions.media') },
    },
    users: {
      myDraftCounts: { queryFilter: queryFilter('users.myDraftCounts') },
      myUploads: { queryFilter: queryFilter('users.myUploads') },
    },
    media: {
      myDrafts: { queryFilter: queryFilter('media.myDrafts') },
    },
    spots: {
      mediaFeed: { pathFilter: pathFilter('spots.mediaFeed') },
      mediaDateIndex: { pathFilter: pathFilter('spots.mediaDateIndex') },
    },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: {
    error: mocks.notifyError,
  },
}));

vi.mock('./useClearUploadQueue', () => ({
  useClearUploadQueue: () => mocks.clearQueue,
}));

function makeMediaItem(id: string): DraftMedia {
  return {
    id,
    sessionId: 'session-1',
    photographerId: 'photographer-1',
    type: 'PHOTO',
    spotId: null,
    capturedAt: new Date('2026-01-01T00:00:00Z'),
    price: null,
    lightboxUrl: `https://cdn.example.com/${id}.jpg`,
    thumbnailUrl: `https://cdn.example.com/${id}-thumb.jpg`,
    cloudinaryPublicId: id,
    status: 'DRAFT',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    resource: {
      resourceType: 'image',
      url: `https://cdn.example.com/${id}.jpg`,
      assetId: `asset-${id}`,
    },
  };
}

function readyQueue(mediaIds: string[]): GalleryCard[] {
  return mediaIds.map((mediaId) => ({
    kind: 'asset' as const,
    id: mediaId,
    result: makeMediaItem(mediaId),
  }));
}

describe('usePublishUploadSession', () => {
  const sessionDate = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.saveWorkspace.mockResolvedValue({ id: 'session-1' });
  });

  it('saves a valid workspace and clears only transient upload state', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: { id: 'spot-1' },
        queue: readyQueue(['media-1', 'media-2']),
        sessionDate,
        sessionRange: [360, 600],
        photoPrice: 300,
        videoPrice: 500,
        onComplete,
      }),
    );

    await act(async () => {
      await result.current.publish();
    });

    expect(mocks.saveWorkspace).toHaveBeenCalledWith({ workspaceId: 'workspace-1' });
    expect(mocks.clearQueue).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith('session-1');
  });

  it('does not refetch getWorkspaceState after saving (the workspace is retired)', async () => {
    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: { id: 'spot-1' },
        queue: readyQueue(['media-1']),
        sessionDate,
        sessionRange: [360, 600],
        photoPrice: 300,
        videoPrice: 500,
        onComplete: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.publish();
    });

    const invalidatedKeys = mocks.invalidateQueries.mock.calls.map(([filter]) => filter.queryKey[0]);
    // saveWorkspace has just moved the workspace to SAVED; getWorkspaceState only
    // serves ACTIVE workspaces, so refetching it here 404s (surfaced as a 500).
    expect(invalidatedKeys).not.toContain('uploads.getWorkspaceState');
    // The current-workspace indicator and the newly published session refresh.
    expect(invalidatedKeys).toContain('uploads.getActiveWorkspace');
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sessions.byId', 'session-1'],
    });
    // Publishing puts new media in front of viewers — refresh the public feed too.
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots.mediaFeed'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots.mediaDateIndex'] });
  });

  it('reports missing inputs in their visual order without saving', async () => {
    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: null,
        queue: [],
        sessionDate: null,
        sessionRange: [600, 360],
        photoPrice: 200,
        videoPrice: 500,
        onComplete: vi.fn(),
      }),
    );

    expect(result.current.violations).toEqual(['spot', 'media', 'price', 'time']);

    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.hasTriedPublish).toBe(true);
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });

  it('does not save a workspace with an under-minimum price', async () => {
    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: { id: 'spot-1' },
        queue: readyQueue(['media-1']),
        sessionDate,
        sessionRange: [360, 600],
        photoPrice: 200,
        videoPrice: 500,
        onComplete: vi.fn(),
      }),
    );

    expect(result.current.violations).toEqual(['price']);

    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.hasTriedPublish).toBe(true);
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });

  it('notifies and keeps the queue open when save fails', async () => {
    mocks.saveWorkspace.mockRejectedValue(new Error('Network down'));
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: { id: 'spot-1' },
        queue: readyQueue(['media-1']),
        sessionDate,
        sessionRange: [360, 600],
        photoPrice: 300,
        videoPrice: 500,
        onComplete,
      }),
    );

    await act(async () => {
      await result.current.publish();
    });

    expect(mocks.notifyError).toHaveBeenCalledWith('Network down', 'Save Failed');
    expect(mocks.clearQueue).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not save while any upload card is still active', async () => {
    const queue = [
      ...readyQueue(['media-1']),
      {
        kind: 'attempt' as const,
        id: 'upload-2',
        source: 'LOCAL' as const,
        status: 'ACQUIRING' as const,
        previewUrl: 'blob:active',
        resourceType: 'image' as const,
        progress: 50,
      },
    ] satisfies GalleryCard[];

    const { result } = renderHook(() =>
      usePublishUploadSession({
        workspaceId: 'workspace-1',
        spot: { id: 'spot-1' },
        queue,
        sessionDate,
        sessionRange: [360, 600],
        photoPrice: 300,
        videoPrice: 500,
        onComplete: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.publish();
    });

    expect(result.current.hasTriedPublish).toBe(true);
    expect(mocks.saveWorkspace).not.toHaveBeenCalled();
  });
});
