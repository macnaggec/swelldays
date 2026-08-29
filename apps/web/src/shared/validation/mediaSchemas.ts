import { z } from 'zod';
import { MEDIA_RESOURCE_TYPE } from '@swelldays/contracts/core';
import { webConfig } from 'config/env';

const cloudName = webConfig.cloudinary.cloudName;
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
