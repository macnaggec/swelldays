import { z } from 'zod';

export const createCheckoutSchema = z.object({
  itemIds: z.array(z.uuid()).min(1),
  guestEmail: z.string().email().optional(),
});

export const getSignedMediaAccessSchema = z.object({
  mediaItemId: z.uuid(),
});

export const getSignedMediaAccessByTokenSchema = z.object({
  downloadToken: z.string().length(64),
});

export const getGuestPurchasesSchema = z.object({
  orderId: z.uuid(),
});

export const getGuestDownloadAccessSchema = z.object({
  purchaseId: z.uuid(),
  orderId: z.uuid(),
});

export const saveGuestEmailSchema = z.object({
  orderId: z.uuid(),
  email: z.string().email(),
});
