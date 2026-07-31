import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeleteMedia } from './useDeleteMedia';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

function queryKey(path: string) {
  return (input?: unknown) => [path, input];
}

function queryFilter(path: string) {
  return (input?: unknown) => ({ queryKey: [path, input] });
}

function pathFilter(path: string) {
  return () => ({ queryKey: [path] });
}

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: { onSuccess?: () => unknown }) => ({
    mutateAsync: async (variables: unknown) => {
      await options.onSuccess?.();
      return variables;
    },
    isPending: false,
  }),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    media: {
      delete: { mutationOptions: (options?: object) => options ?? {} },
      myDrafts: { queryKey: queryKey('media.myDrafts') },
    },
    users: {
      myUploads: { queryKey: queryKey('users.myUploads') },
      myDraftCounts: { queryKey: queryKey('users.myDraftCounts') },
    },
    sessions: {
      mine: { queryFilter: queryFilter('sessions.mine') },
      byId: { queryFilter: queryFilter('sessions.byId') },
      list: { pathFilter: () => ({ queryKey: ['sessions.list'] }) },
    },
    spots: {
      mediaFeed: { pathFilter: pathFilter('spots.mediaFeed') },
      mediaDateIndex: { pathFilter: pathFilter('spots.mediaDateIndex') },
    },
  }),
}));

describe('useDeleteMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes session projections broadly, since the deleted item\'s session id is unknown here', async () => {
    const { result } = renderHook(() => useDeleteMedia());

    await result.current.mutateAsync({ id: 'media-1' });

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users.myUploads', undefined] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users.myDraftCounts', undefined] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['media.myDrafts', undefined] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['sessions.mine', undefined] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['sessions.byId', undefined] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['sessions.list'] });
    // The deleted item may have been published — refresh the public feed too.
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots.mediaFeed'] });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['spots.mediaDateIndex'] });
  });
});
