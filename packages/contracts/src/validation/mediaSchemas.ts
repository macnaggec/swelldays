import { z } from 'zod';
import { MIN_MEDIA_PRICE_CENTS } from '../constants/media';

export const mediaUpdateSchema = z.object({
  id: z.uuid(),
  price: z.number().int().min(MIN_MEDIA_PRICE_CENTS).optional(),
  capturedAt: z.coerce.date().optional(),
});

export const mediaBatchUpdateSchema = z
  .object({
    mediaIds: z.array(z.uuid()).min(1),
    price: z.number().int().min(MIN_MEDIA_PRICE_CENTS).optional(),
    capturedAt: z.coerce.date().optional(),
    spotId: z.uuid().optional(),
  })
  .refine((input) => (
    input.price !== undefined
    || input.capturedAt !== undefined
    || input.spotId !== undefined
  ), {
    error: 'Must provide at least one of: price, capturedAt, spotId',
  });

export const registerDriveImportSchema = z.object({
  draftId: z.uuid(),
  remoteFileId: z.string().min(1),
  mimeType: z.string().min(1),
  accessToken: z.string().min(1),
});
