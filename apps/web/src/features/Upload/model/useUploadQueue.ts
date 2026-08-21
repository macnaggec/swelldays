import { useMemo } from 'react';
import { MEDIA_STATUS, type DraftMedia } from 'entities/Media';
import { useUploadStore } from './uploadStore';
import type { AttemptCard, GalleryCard } from './types';
import type { UploadAttemptProjection } from '@swelldays/contracts';
import type {
  UploadWorkspaceAssetProjection,
  UploadWorkspaceExistingMedia,
  UploadWorkspaceState,
} from '@swelldays/contracts';

export function useUploadQueue(workspaceState: UploadWorkspaceState | undefined) {
  const transferMap = useUploadStore(s => s.transfers);

  const queue = useMemo<GalleryCard[]>(() => {
    const transfers = Array.from(transferMap.values());
    const cards: GalleryCard[] = [];
    const attemptIdsSeen = new Set<string>();
    const stagedRemovalIds = new Set(workspaceState?.stagedRemovalIds ?? []);
    const attempts = workspaceState?.attempts ?? [];

    for (const attempt of attempts as UploadAttemptProjection[]) {
      attemptIdsSeen.add(attempt.id);
      const transfer = transfers.find(t => t.attemptId === attempt.id);
      const localError = transfer?.source === 'local' ? transfer.error : undefined;
      const card: AttemptCard = {
        kind: 'attempt',
        id: attempt.id,
        source: attempt.source,
        status: localError ? 'FAILED' : attempt.status,
        previewUrl: transfer?.previewUrl ?? '',
        resourceType: transfer?.resourceType ?? 'image',
        progress: transfer?.source === 'local' ? transfer.progress : undefined,
        errorCode: localError ?? attempt.errorCode ?? undefined,
      };
      cards.push(card);
    }

    for (const t of transfers) {
      if (t.attemptId && attemptIdsSeen.has(t.attemptId)) continue;
      const localError = t.source === 'local' ? t.error : undefined;
      const card: AttemptCard = {
        kind: 'attempt',
        id: t.clientRequestId,
        source: t.source.toUpperCase() as AttemptCard['source'],
        status: localError ? 'FAILED' : 'pending',
        previewUrl: t.previewUrl,
        resourceType: t.resourceType,
        progress: t.source === 'local' ? t.progress : undefined,
        errorCode: localError,
      };
      cards.push(card);
    }

    if (workspaceState) {
      for (const media of workspaceState.existingMedia) {
        if (stagedRemovalIds.has(media.id)) continue;
        cards.push({
          kind: 'existing',
          id: media.id,
          result: existingMediaToItem(workspaceState, media),
        });
      }

      for (const asset of workspaceState.assets) {
        cards.push({
          kind: 'asset',
          id: asset.id,
          result: assetToItem(workspaceState, asset),
        });
      }
    }

    return cards;
  }, [workspaceState, transferMap]);

  const hasActiveUploads = queue.some(
    c => c.kind === 'attempt' && ['pending', 'READY', 'ACQUIRING', 'FINALIZING'].includes(c.status),
  );

  const selectableItems = queue.filter(c => c.kind !== 'attempt');

  return { queue, hasActiveUploads, selectableItems };
}

function resourceType(type: 'PHOTO' | 'VIDEO'): 'image' | 'video' {
  return type === 'VIDEO' ? 'video' : 'image';
}

function existingMediaToItem(state: UploadWorkspaceState, media: UploadWorkspaceExistingMedia): DraftMedia {
  return {
    id: media.id,
    sessionId: state.workspace.targetSessionId ?? state.workspace.id,
    photographerId: '',
    type: media.type,
    spotId: state.workspace.spotId,
    capturedAt: media.capturedAt,
    dateSource: 'fallback',
    price: media.price,
    lightboxUrl: media.lightboxUrl,
    thumbnailUrl: media.thumbnailUrl,
    cloudinaryPublicId: media.cloudinaryPublicId,
    width: media.width,
    height: media.height,
    status: MEDIA_STATUS.PUBLISHED,
    createdAt: media.capturedAt,
    resource: {
      resourceType: resourceType(media.type),
      url: media.lightboxUrl,
      assetId: media.cloudinaryPublicId,
    },
  };
}

function assetToItem(state: UploadWorkspaceState, asset: UploadWorkspaceAssetProjection): DraftMedia {
  return {
    id: asset.id,
    sessionId: state.workspace.targetSessionId ?? state.workspace.id,
    photographerId: '',
    type: asset.type,
    spotId: state.workspace.spotId,
    capturedAt: asset.capturedAt,
    dateSource: 'fallback',
    price: null,
    lightboxUrl: asset.lightboxUrl,
    thumbnailUrl: asset.thumbnailUrl,
    cloudinaryPublicId: asset.cloudinaryPublicId,
    width: asset.width,
    height: asset.height,
    status: MEDIA_STATUS.DRAFT,
    createdAt: asset.createdAt,
    resource: {
      resourceType: resourceType(asset.type),
      url: asset.lightboxUrl,
      assetId: asset.cloudinaryPublicId,
    },
  };
}
