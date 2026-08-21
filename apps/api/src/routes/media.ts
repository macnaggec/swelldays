import { router, protectedProcedure } from 'server/trpc';
import { mediaService } from 'server/services/MediaService';
import { mediaBatchUpdateSchema, mediaUpdateSchema } from '@swelldays/contracts';
import { z } from 'zod';
import { mediaFavoriteService } from 'server/services/MediaFavoriteService';

export const mediaRouter = router({
  favoriteIds: protectedProcedure.query(({ ctx }) =>
    mediaFavoriteService.getFavoriteIds(ctx.user.id)),

  favorites: protectedProcedure.query(({ ctx }) =>
    mediaFavoriteService.getFavorites(ctx.user.id)),

  setFavorite: protectedProcedure
    .input(z.object({ mediaItemId: z.uuid(), favorited: z.boolean() }))
    .mutation(({ input, ctx }) =>
      mediaFavoriteService.setFavorite(ctx.user.id, input.mediaItemId, input.favorited)),

  update: protectedProcedure
    .input(mediaUpdateSchema)
    .mutation(({ input, ctx }) =>
      mediaService.updateMedia(ctx.user.id, input.id, { price: input.price })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ input, ctx }) => mediaService.deleteMedia(ctx.user.id, input.id)),

  deleteBatch: protectedProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1) }))
    .mutation(({ input, ctx }) => mediaService.deleteMediaBatch(ctx.user.id, input.ids)),

  updateBatch: protectedProcedure
    .input(mediaBatchUpdateSchema)
    .mutation(({ input, ctx }) =>
      mediaService.updateBatch(ctx.user.id, input.mediaIds, { price: input.price, capturedAt: input.capturedAt, spotId: input.spotId })
    ),

  updatePublishedBatch: protectedProcedure
    .input(mediaBatchUpdateSchema)
    .mutation(({ input, ctx }) =>
      mediaService.updatePublishedBatch(ctx.user.id, input.mediaIds, { price: input.price, capturedAt: input.capturedAt })
    ),

  myDrafts: protectedProcedure
    .query(({ ctx }) => mediaService.getMyDrafts(ctx.user.id)),
});
