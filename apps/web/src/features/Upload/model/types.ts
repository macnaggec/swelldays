import type { DraftMedia } from 'entities/Media';
import type { UploadAttemptStatus, UploadSource } from '@swelldays/contracts';

// ── Browser-only transfer resources ────────────────────────────────────────
// The store owns these. They are lost on page reload.

export type LocalTransfer = {
  source: 'local';
  clientRequestId: string;
  attemptId?: string;         // undefined until beginLocal resolves
  file: File;
  previewUrl: string;
  resourceType: 'image' | 'video';
  progress: number;
  capturedAt?: Date | null;   // undefined until EXIF extraction resolves
  abort?: () => void;
  error?: string;             // set when the XHR or server call fails
};

export type DriveTransfer = {
  source: 'drive';
  clientRequestId: string;
  attemptId?: string;         // undefined until beginDrive resolves
  previewUrl: string;
  resourceType: 'image' | 'video';
};

export type BrowserTransfer = LocalTransfer | DriveTransfer;

// ── Gallery cards ────────────────────────────────────────────────────────────

/**
 * 'pending': beginLocal / beginDrive has not yet returned.
 * UploadAttemptStatus thereafter, from the Query projection.
 */
export type AttemptCardStatus = 'pending' | UploadAttemptStatus;

export type AttemptCard = {
  kind: 'attempt';
  /** clientRequestId before server responds; attemptId after. */
  id: string;
  source: UploadSource;
  status: AttemptCardStatus;
  previewUrl: string;
  resourceType: 'image' | 'video';
  progress?: number;       // local only
  capturedAt?: Date | null; // local only; set once EXIF extraction resolves
  errorCode?: string;      // set when status is FAILED
};

export type ExistingMediaCard = {
  kind: 'existing';
  id: string;
  result: DraftMedia;
};

export type WorkspaceAssetCard = {
  kind: 'asset';
  id: string;
  result: DraftMedia;
};

export type ReadyMediaCard = ExistingMediaCard | WorkspaceAssetCard;

export type GalleryCard = AttemptCard | ReadyMediaCard;

export function getItemId(card: GalleryCard): string {
  return card.id;
}

export function isVideoItem(card: GalleryCard): boolean {
  if (card.kind !== 'attempt') return card.result.resource.resourceType === 'video';
  return card.resourceType === 'video';
}
