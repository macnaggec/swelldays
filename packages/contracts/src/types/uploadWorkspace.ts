import type { UploadAttemptProjection } from './upload';

export type UploadWorkspaceKind = 'NEW_SESSION' | 'SESSION_EDIT';
export type UploadWorkspaceStatus = 'ACTIVE' | 'SAVED' | 'CANCELLED';
export type UploadWorkspaceAssetStatus = 'READY' | 'PROMOTED' | 'CLEANUP_PENDING' | 'DELETED';

export interface UploadWorkspaceSummary {
  id: string;
  kind: UploadWorkspaceKind;
  status: UploadWorkspaceStatus;
  targetSessionId: string | null;
  spotId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  photoPrice: number;
  videoPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UploadWorkspaceExistingMedia {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  thumbnailUrl: string;
  lightboxUrl: string;
  capturedAt: Date;
  price: number | null;
  cloudinaryPublicId: string;
  width: number | null;
  height: number | null;
}

export interface UploadWorkspaceAssetProjection {
  id: string;
  type: 'PHOTO' | 'VIDEO';
  status: UploadWorkspaceAssetStatus;
  thumbnailUrl: string;
  lightboxUrl: string;
  capturedAt: Date;
  cloudinaryPublicId: string;
  uploadAttemptId: string | null;
  createdAt: Date;
  width: number | null;
  height: number | null;
}

export interface UploadWorkspaceState {
  workspace: UploadWorkspaceSummary;
  existingMedia: UploadWorkspaceExistingMedia[];
  assets: UploadWorkspaceAssetProjection[];
  stagedRemovalIds: string[];
  attempts: UploadAttemptProjection[];
}
