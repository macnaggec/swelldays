export const UPLOAD_SOURCE = { LOCAL: 'LOCAL', DRIVE: 'DRIVE' } as const;

export const UPLOAD_ATTEMPT_STATUS = {
  READY: 'READY',
  ACQUIRING: 'ACQUIRING',
  FINALIZING: 'FINALIZING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CLEANUP_PENDING: 'CLEANUP_PENDING',
  CANCELLED: 'CANCELLED',
} as const;

export type UploadSource = typeof UPLOAD_SOURCE[keyof typeof UPLOAD_SOURCE];
export type UploadAttemptStatus = typeof UPLOAD_ATTEMPT_STATUS[keyof typeof UPLOAD_ATTEMPT_STATUS];

/** Statuses that prevent a draft from publishing. */
export const STATUSES_BLOCKING_PUBLISH = [
  UPLOAD_ATTEMPT_STATUS.READY,
  UPLOAD_ATTEMPT_STATUS.ACQUIRING,
  UPLOAD_ATTEMPT_STATUS.FINALIZING,
  UPLOAD_ATTEMPT_STATUS.FAILED,
] as const satisfies readonly UploadAttemptStatus[];

/** Statuses where the attempt may still produce a Cloudinary asset needing cleanup. */
export const STATUSES_NEEDING_RECONCILIATION = [
  UPLOAD_ATTEMPT_STATUS.READY,
  UPLOAD_ATTEMPT_STATUS.FAILED,
  UPLOAD_ATTEMPT_STATUS.CANCEL_REQUESTED,
  UPLOAD_ATTEMPT_STATUS.CLEANUP_PENDING,
] as const satisfies readonly UploadAttemptStatus[];

/** Safe attempt shape returned to the client. Never includes OAuth tokens. */
export interface UploadAttemptProjection {
  id: string;
  clientRequestId: string;
  source: UploadSource;
  status: UploadAttemptStatus;
  cloudinaryPublicId: string;
  errorCode: string | null;
  createdAt: Date;
}

/** Grant returned by beginLocal — all fields needed by the browser XHR. */
export interface DirectUploadGrant {
  attemptId: string;
  cloudinaryPublicId: string;
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  type: 'authenticated';
  eager: string;
  expiresAt: Date;
}
