import { useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MEDIA_UPLOAD_LIMITS } from 'entities/Media';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { useTRPC } from 'shared/lib/trpc';
import { useUploadCommands } from './useUploadCommands';
import {
  startLocalUpload,
  startDriveUpload,
  discardAttempt,
  discardAllWorkspace,
  abortAllLocalTransfers,
  retryAttempt,
  type DriveSelection,
} from './uploadCoordinator';
import { requestDriveAccessToken } from './useGooglePicker';
import type { GalleryCard } from './types';

function validateFileSize(file: File): void {
  const max = file.type.startsWith('video/')
    ? MEDIA_UPLOAD_LIMITS.MAX_FILE_SIZE_VIDEO
    : MEDIA_UPLOAD_LIMITS.MAX_FILE_SIZE_IMAGE;
  if (file.size > max) throw new Error(`${file.name} exceeds the maximum allowed size.`);
}

export type UploadWorkspaceSeed = {
  spotId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  photoPrice: number;
  videoPrice: number;
};

/**
 * `workspaceId` may start undefined for a brand-new upload. The workspace is created lazily
 * on the first file/drive selection, seeded with whatever spot/date/price the user chose
 * locally, so opening the upload UI alone does not occupy the one active workspace slot.
 */
export function useUploadManager(
  workspaceId: string | undefined,
  seed: UploadWorkspaceSeed,
  onWorkspaceCreated?: (workspaceId: string) => void,
) {
  const trpc = useTRPC();
  const commands = useUploadCommands(workspaceId);
  const { mutateAsync: startNewWorkspace } = useMutation(trpc.uploads.startNewWorkspace.mutationOptions());

  const workspaceIdRef = useRef(workspaceId);
  const seedRef = useRef(seed);
  const onWorkspaceCreatedRef = useRef(onWorkspaceCreated);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
    seedRef.current = seed;
    onWorkspaceCreatedRef.current = onWorkspaceCreated;
  });

  const ensureWorkspacePromiseRef = useRef<Promise<string> | null>(null);

  const ensureWorkspaceId = useCallback((): Promise<string> => {
    if (workspaceIdRef.current) return Promise.resolve(workspaceIdRef.current);
    if (!ensureWorkspacePromiseRef.current) {
      const s = seedRef.current;
      ensureWorkspacePromiseRef.current = startNewWorkspace({
        spotId: s.spotId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        photoPrice: s.photoPrice,
        videoPrice: s.videoPrice,
      }).then((created) => {
        workspaceIdRef.current = created.id;
        onWorkspaceCreatedRef.current?.(created.id);
        return created.id;
      }).catch((err) => {
        ensureWorkspacePromiseRef.current = null;
        throw err;
      });
    }
    return ensureWorkspacePromiseRef.current;
  }, [startNewWorkspace]);

  const addFiles = useCallback((files: File[]) => {
    for (const file of files) {
      try {
        validateFileSize(file);
        void ensureWorkspaceId()
          .then((id) => startLocalUpload(file, { commands, workspaceId: id }))
          .catch(err => notify.error(`${file.name}: ${getErrorMessage(err)}`, 'Upload Failed'));
      } catch (err) {
        notify.error(getErrorMessage(err), 'Upload Failed');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureWorkspaceId]);

  const addDriveSelections = useCallback((selections: DriveSelection[]) => {
    for (const sel of selections) {
      void ensureWorkspaceId()
        .then((id) => startDriveUpload(sel, { commands, workspaceId: id }))
        .catch(err => notify.error(getErrorMessage(err), 'Drive Import Failed'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensureWorkspaceId]);

  const remove = useCallback(async (kind: GalleryCard['kind'], id: string) => {
    try {
      if (kind === 'attempt') {
        if (workspaceIdRef.current) await discardAttempt(id, { commands, workspaceId: workspaceIdRef.current });
      } else if (kind === 'existing' && workspaceIdRef.current) {
        await commands.stageMediaRemoval({ workspaceId: workspaceIdRef.current, mediaItemId: id });
      } else if (kind === 'asset' && workspaceIdRef.current) {
        await commands.deleteWorkspaceAsset({ workspaceId: workspaceIdRef.current, assetId: id });
      }
    } catch (err) {
      notify.error(getErrorMessage(err), 'Delete Failed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const discardAll = useCallback(async () => {
    if (!workspaceIdRef.current) {
      abortAllLocalTransfers();
      return;
    }
    try {
      await discardAllWorkspace({ commands, workspaceId: workspaceIdRef.current });
    } catch (err) {
      notify.error(getErrorMessage(err), 'Discard Failed');
      throw err;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const retry = useCallback((id: string) => {
    if (!workspaceIdRef.current) return;
    void retryAttempt(id, { commands, workspaceId: workspaceIdRef.current }, requestDriveAccessToken).catch(err =>
      notify.error(getErrorMessage(err), 'Retry Failed'),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const abortAllTransfers = useCallback(() => {
    abortAllLocalTransfers();
  }, []);

  return { addFiles, addDriveSelections, remove, discardAll, abortAllTransfers, retry };
}

export type UploadManagerHandlers = ReturnType<typeof useUploadManager>;
