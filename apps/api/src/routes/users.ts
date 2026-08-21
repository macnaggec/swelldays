import { router, protectedProcedure } from 'server/trpc';
import { mediaService } from 'server/services/MediaService';
import { userService } from 'server/services/UserService';

export const usersRouter = router({
  myUploads: protectedProcedure.query(async ({ ctx }) => {
    const items = await mediaService.findPublishedByPhotographer(ctx.user.id);
    return items.map((m) => ({
      id: m.id,
      type: m.type,
      // Show the watermarked URL — photographer sees the public version of their media
      url: m.lightboxUrl,
      thumbnailUrl: m.thumbnailUrl,
      price: Number(m.price),
      capturedAt: m.capturedAt,
      spotId: m.spotId,
      spotName: m.spot?.name ?? null,
      photographer: { id: m.photographerId, name: null as string | null },
    }));
  }),

  myDraftCounts: protectedProcedure.query(async ({ ctx }) => {
    const hasDrafts = await mediaService.hasDrafts(ctx.user.id);
    return { hasDrafts };
  }),

  deleteAccount: protectedProcedure.mutation(({ ctx }) => userService.deleteAccount(ctx.user.id)),
});
