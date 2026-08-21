import { z } from 'zod';
import { MEDIA_RESOURCE_TYPE } from '@wave-atlas/contracts';

const cloudName =
  typeof process !== 'undefined'
    ? process.env.VITE_CLOUDINARY_CLOUD_NAME
    : (import.meta as { env?: Record<string, string> }).env?.VITE_CLOUDINARY_CLOUD_NAME;
const cloudinaryBase = cloudName ? `https://res.cloudinary.com/${cloudName}/` : null;

export const mediaCloudinaryUrlSchema = z.url().refine(
  (url) => !!cloudinaryBase && url.startsWith(cloudinaryBase),
  { message: 'URL must be a Cloudinary URL for this account' },
);

export const mediaCloudinaryResultSchema = z.object({
  publicId: z.string().min(1),
  thumbnailUrl: mediaCloudinaryUrlSchema,
  lightboxUrl: mediaCloudinaryUrlSchema,
  resourceType: z.enum([MEDIA_RESOURCE_TYPE.IMAGE, MEDIA_RESOURCE_TYPE.VIDEO]),
  /** Original source dimensions from Cloudinary; optional so an upload never fails if absent. */
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const mediaCreateSchema = z.object({
  draftId: z.uuid(),
  cloudinaryResult: mediaCloudinaryResultSchema,
  capturedAt: z.coerce.date().optional(),
});
