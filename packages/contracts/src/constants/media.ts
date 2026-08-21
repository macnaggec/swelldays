import type { Cents } from '../types/coordinates';

export const MEDIA_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  DELETED: 'DELETED',
  DRIVE_PENDING: 'DRIVE_PENDING',
} as const;

export const MEDIA_RESOURCE_TYPE = {
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export const MEDIA_UPLOAD_LIMITS = {
  MAX_FILE_SIZE_IMAGE: 10 * 1024 * 1024,
  MAX_FILE_SIZE_VIDEO: 50 * 1024 * 1024,
  MAX_FILES_PER_BATCH: 20,
  MAX_BATCH_SIZE: 200 * 1024 * 1024,
} as const;

/** Minimum media price in cents. All published media must cost at least $3.00. */
export const MIN_MEDIA_PRICE_CENTS: Cents = 300;

export type MediaStatus = typeof MEDIA_STATUS[keyof typeof MEDIA_STATUS];
export type MediaResourceType = typeof MEDIA_RESOURCE_TYPE[keyof typeof MEDIA_RESOURCE_TYPE];
