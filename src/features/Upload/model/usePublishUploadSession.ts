import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { notify } from 'shared/lib/notifications';
import { useTRPC } from 'shared/lib/trpc';
import { MIN_MEDIA_PRICE_CENTS, useMediaPublicProjectionInvalidation } from 'entities/Media';
import { useSessionLifecycleInvalidation } from 'entities/SurfSession';
import type { GalleryCard } from './types';
import { useClearUploadQueue } from './useClearUploadQueue';
import { getUploadQueueStatus } from './uploadQueuePolicy';

type PublishSpot = {
  id: string;
} | null;

export type UploadPublishViolation = 'spot' | 'media' | 'price' | 'time';

export type UsePublishUploadSessionOptions = {
  workspaceId: string | undefined;
  spot: PublishSpot;
  queue: GalleryCard[];
  sessionDate: Date | null;
  sessionRange: [number, number];
  photoPrice: number;
  videoPrice: number;
  onComplete: (sessionId: string) => void;
};

export function usePublishUploadSession({
  workspaceId,
  spot,
  queue,
  sessionDate,
  sessionRange,
  photoPrice,
  videoPrice,
  onComplete,
}: UsePublishUploadSessionOptions) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidateSessionLifecycle = useSessionLifecycleInvalidation();
  const invalidateMediaPublicProjection = useMediaPublicProjectionInvalidation();
  const clearQueue = useClearUploadQueue();
  const { mutateAsync: saveWorkspace, isPending } = useMutation(
    trpc.uploads.saveWorkspace.mutationOptions({
      onSuccess: async (result) => {
        // NB: do NOT invalidate getWorkspaceState here. saveWorkspace has just moved
        // this workspace to SAVED, and getWorkspaceState only serves ACTIVE workspaces.
        // While the /upload route is still mounted (navigation happens later, in
        // onComplete), invalidating would immediately refetch a now-unreadable
        // workspace → NotFound → HTTP 500. The query unmounts on navigation and its
        // stale cache is GC'd; there is no fresh state to fetch for a retired workspace.
        await Promise.all([
          invalidateSessionLifecycle(result.id),
          invalidateMediaPublicProjection(),
          queryClient.invalidateQueries(trpc.uploads.getActiveWorkspace.queryFilter()),
        ]);
      },
    }),
  );
  const [hasTriedPublish, setHasTriedPublish] = useState(false);
  const queueStatus = useMemo(() => getUploadQueueStatus(queue), [queue]);

  const violations = useMemo(() => {
    const nextViolations: UploadPublishViolation[] = [];
    if (!spot) nextViolations.push('spot');
    if (!workspaceId || !queueStatus.canContinue) nextViolations.push('media');
    if (photoPrice < MIN_MEDIA_PRICE_CENTS || videoPrice < MIN_MEDIA_PRICE_CENTS) {
      nextViolations.push('price');
    }
    if (!sessionDate || sessionRange[0] >= sessionRange[1]) nextViolations.push('time');
    return nextViolations;
  }, [photoPrice, queueStatus.canContinue, sessionDate, sessionRange, spot, videoPrice, workspaceId]);

  const canPublish = violations.length === 0;

  const publish = useCallback(async () => {
    if (!canPublish || !workspaceId) {
      setHasTriedPublish(true);
      return;
    }

    let result;
    try {
      result = await saveWorkspace({ workspaceId });
    } catch (err) {
      notify.error(getErrorMessage(err), 'Save Failed');
      return;
    }

    clearQueue();
    onComplete(result.id);
  }, [
    canPublish,
    workspaceId,
    saveWorkspace,
    clearQueue,
    onComplete,
  ]);

  return {
    canPublish,
    hasTriedPublish,
    isPending,
    publish,
    violations,
  };
}
