/**
 * MODEL LAYER - Business logic and state management
 *
 * Exports public API for Upload feature.
 * Following FSD (Feature-Sliced Design) architecture.
 */

// Main hooks
export { useUploadManager } from './useUploadManager';
export { useClearUploadQueue } from './useClearUploadQueue';
export { useUploadQueue } from './useUploadQueue';
export { useUploadWarning } from './useUploadWarning';
export { useGooglePicker } from './useGooglePicker';
export { usePublishUploadSession, type UploadPublishViolation } from './usePublishUploadSession';
export { useUploadStore } from './uploadStore';
export { getPublishableMediaIds, getSelectableUploadCards, getUploadQueueStatus } from './uploadQueuePolicy';

// Types
export type {
  BrowserTransfer,
  LocalTransfer,
  DriveTransfer,
  GalleryCard,
  AttemptCard,
  ExistingMediaCard,
  WorkspaceAssetCard,
  ReadyMediaCard,
  AttemptCardStatus,
} from './types';
export type { UploadWorkspaceSeed, UploadManagerHandlers } from './useUploadManager';
export type { DriveSelection } from './uploadCoordinator';
export { getItemId, isVideoItem } from './types';
