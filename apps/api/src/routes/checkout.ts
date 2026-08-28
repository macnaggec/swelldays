import { z } from 'zod';
import { router, protectedProcedure } from 'server/trpc';
import { checkoutService } from 'server/services/CheckoutService';
import { createCheckoutSchema, getSignedMediaAccessSchema } from '@swelldays/contracts';
import { createRateLimiter } from 'server/lib/rateLimiter';

// 5 checkout session creations per user per minute — prevents CryptoCloud API abuse
const createCheckoutLimiter = createRateLimiter({ windowMs: 60_000, max: 5 });

export const checkoutRouter = router({
  /**
   * Creates a CryptoCloud checkout session for the current cart.
   * Returns a URL to redirect the buyer to the hosted payment page.
   */
  create: protectedProcedure
    .input(z.object({
      itemIds: createCheckoutSchema.shape.itemIds,
      clientRequestId: createCheckoutSchema.shape.clientRequestId,
    }))
    .use(({ ctx, next }) => {
      createCheckoutLimiter(ctx.user.id);
      return next();
    })
    .mutation(async ({ input, ctx }) => {
      return checkoutService.createCheckoutSession(ctx.user.id, undefined, input.itemIds, input.clientRequestId);
    }),

  /**
   * Returns all completed purchases for the authenticated buyer.
   * Media URLs are watermarked previews only — download the original via getSignedDownloadUrl.
   */
  myPurchases: protectedProcedure.query(async ({ ctx }) => {
    return checkoutService.getPurchases(ctx.user.id);
  }),

  /**
   * Generates a short-lived signed Cloudinary download URL for a purchased media item.
   *
   * Security: verifies the authenticated user has a Purchase row for this
   * mediaItemId before generating any URL. Prevents access to non-purchased media.
   */
  getSignedMediaAccess: protectedProcedure
    .input(z.object({ mediaItemId: getSignedMediaAccessSchema.shape.mediaItemId }))
    .query(async ({ input, ctx }) => {
      return checkoutService.generateDownloadAccess(ctx.user.id, input.mediaItemId);
    }),
});
