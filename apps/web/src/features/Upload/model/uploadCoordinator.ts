import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from './cloudinaryTransport';
import { useUploadStore } from './uploadStore';
import {
  abortBrowserTransfer,
  releaseBrowserTransferPreview,
  releaseBrowserTransferResources,
} from './browserTransferResources';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import type { UploadCommands } from './useUploadCommands';

// ── Deps injected from useUploadManager ──────────────────────────────────────

export type CoordinatorDeps = {
  commands: UploadCommands;
  workspaceId: string;
};

// ── Drive selection type ─────────────────────────────────────────────────────

export type DriveSelection = {
  remoteFileId: string;
  declaredMimeType: string;
  thumbnailUrl: string;
  accessToken: string;
};

// ── Local upload ─────────────────────────────────────────────────────────────

export async function startLocalUpload(file: File, deps: CoordinatorDeps): Promise<void> {
  const clientRequestId = uuidv4();
  const previewUrl = URL.createObjectURL(file);
  const resourceType = file.type.startsWith('video/') ? 'video' : 'image';

  useUploadStore.getState().addTransfer({
    source: 'local',
    clientRequestId,
    file,
    previewUrl,
    resourceType,
    progress: 0,
  });

  try {
    const grant = await deps.commands.beginLocal({
      workspaceId: deps.workspaceId,
      clientRequestId,
      declaredMimeType: file.type,
      declaredByteSize: file.size,
    });

    useUploadStore.getState().updateTransfer(clientRequestId, { attemptId: grant.attemptId });

    const { promise, abort } = uploadToCloudinary({
      file,
      signature: grant.signature,
      timestamp: grant.timestamp,
      apiKey: grant.apiKey,
      cloudName: grant.cloudName,
      publicId: grant.cloudinaryPublicId,
      eager: grant.eager,
      onProgress: (progress) =>
        useUploadStore.getState().updateTransfer(clientRequestId, { progress }),
    });

    useUploadStore.getState().updateTransfer(clientRequestId, { abort });

    const receipt = await promise;

    await deps.commands.finalizeLocal({
      attemptId: grant.attemptId,
      providerReceipt: receipt,
    });

    await deps.commands.invalidateWorkspaceState(deps.workspaceId);

    // Remove browser resources — DraftMedia is now in Query cache.
    const completedTransfer = useUploadStore.getState().transfers.get(clientRequestId);
    if (completedTransfer) releaseBrowserTransferResources(completedTransfer, { abort: false });
    useUploadStore.getState().removeTransfer(clientRequestId);
  } catch (err) {
    const transfer = useUploadStore.getState().transfers.get(clientRequestId);
    if (!transfer) return; // already removed (discard during upload)
    // Mark the transfer as failed so the UI can show the error and a retry button.
    useUploadStore.getState().updateTransfer(clientRequestId, {
      progress: 0,
      abort: undefined,
      error: getErrorMessage(err),
    });
    throw err;
  }
}

// ── Drive upload ─────────────────────────────────────────────────────────────

export async function startDriveUpload(
  selection: DriveSelection,
  deps: CoordinatorDeps,
): Promise<void> {
  const clientRequestId = uuidv4();

  useUploadStore.getState().addTransfer({
    source: 'drive',
    clientRequestId,
    previewUrl: '',  // Drive thumbnail URLs require auth — Cloudinary URL available after completion
    resourceType: selection.declaredMimeType.startsWith('video/') ? 'video' : 'image',
  });

  const { attemptId } = await deps.commands.beginDrive({
    workspaceId: deps.workspaceId,
    clientRequestId,
    remoteFileId: selection.remoteFileId,
    declaredMimeType: selection.declaredMimeType,
  });

  useUploadStore.getState().updateTransfer(clientRequestId, { attemptId });

  await deps.commands.processDrive({ attemptId, accessToken: selection.accessToken });

  await deps.commands.invalidateWorkspaceState(deps.workspaceId);

  // Remove browser thumbnail — DraftMedia is now in Query cache.
  useUploadStore.getState().removeTransfer(clientRequestId);
}

// ── Discard ───────────────────────────────────────────────────────────────────

export async function discardAttempt(
  clientRequestIdOrAttemptId: string,
  deps: CoordinatorDeps,
): Promise<void> {
  // Find the transfer by clientRequestId or attemptId.
  const all = useUploadStore.getState().getAll();
  const transfer = all.find(
    t => t.clientRequestId === clientRequestIdOrAttemptId
      || t.attemptId === clientRequestIdOrAttemptId,
  );

  // Stop in-flight network work immediately, but keep the preview visible until
  // the authoritative server attempt has been discarded successfully.
  if (transfer) abortBrowserTransfer(transfer);

  if (transfer?.attemptId) {
    await deps.commands.discard({ attemptId: transfer.attemptId });
  } else if (!transfer) {
    // No browser transfer found (e.g. page was reloaded). Treat the passed ID
    // as a server-side attempt ID and call discard directly.
    await deps.commands.discard({ attemptId: clientRequestIdOrAttemptId });
  }

  if (transfer) {
    releaseBrowserTransferPreview(transfer);
    useUploadStore.getState().removeTransfer(transfer.clientRequestId);
  }
}

export async function discardAllWorkspace(deps: CoordinatorDeps): Promise<void> {
  const transfers = useUploadStore.getState().getAll();

  // Abort all in-flight local XHRs immediately.
  transfers.forEach(abortBrowserTransfer);

  // Single server transaction — awaited before previews or UI state clear.
  await deps.commands.cancelWorkspace({ workspaceId: deps.workspaceId });

  transfers.forEach(releaseBrowserTransferPreview);
  useUploadStore.getState().clearTransfers();
}

/**
 * Client-side-only abort used when the route is leaving after Save. Workspace Cancel is the
 * server-side operation that marks attempts/assets cancelled when the user explicitly cancels.
 */
export function abortAllLocalTransfers(): void {
  const transfers = useUploadStore.getState().getAll();
  transfers.forEach(abortBrowserTransfer);
  transfers.forEach(releaseBrowserTransferPreview);
  useUploadStore.getState().clearTransfers();
}

// ── Retry ─────────────────────────────────────────────────────────────────────

export async function retryAttempt(
  clientRequestIdOrAttemptId: string,
  deps: CoordinatorDeps,
  requestDriveAccessToken: () => Promise<string>,
): Promise<void> {
  const transfer = useUploadStore.getState().getAll().find(
    t => t.clientRequestId === clientRequestIdOrAttemptId
      || t.attemptId === clientRequestIdOrAttemptId,
  );

  if (!transfer) return;

  if (transfer.source === 'local') {
    const { file } = transfer;
    // Discard the old server attempt (if it was created before the XHR failed)
    // so it doesn't ghost as a second "Preparing…" card after the retry.
    if (transfer.attemptId) {
      await deps.commands.discard({ attemptId: transfer.attemptId });
    }
    // Drop the old failed card BEFORE re-uploading. startLocalUpload adds its own
    // fresh card and re-throws if it fails again — if we removed the old card only
    // afterwards, a re-failed retry would leave both cards and stack a duplicate
    // on every press.
    releaseBrowserTransferResources(transfer, { abort: false });
    useUploadStore.getState().removeTransfer(transfer.clientRequestId);
    await startLocalUpload(file, deps);
  } else {
    // Drive retry: obtain fresh access token, then re-process.
    const accessToken = await requestDriveAccessToken();
    if (!transfer.attemptId) return;
    await deps.commands.processDrive({ attemptId: transfer.attemptId, accessToken });
    useUploadStore.getState().removeTransfer(transfer.clientRequestId);
  }
}
