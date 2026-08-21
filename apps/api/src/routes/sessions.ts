import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from 'server/trpc';
import { surfSessionRepository } from 'server/repositories/SurfSessionRepository';
import { surfSessionService } from 'server/services/SurfSessionService';
import { mediaService } from 'server/services/MediaService';

export const sessionsRouter = router({
  /** Paginated list of published sessions, optionally filtered by spot and date range. */
  list: publicProcedure
    .input(
      z.object({
        spotId: z.uuid().optional(),
        cursor: z.uuid().optional(),
        limit: z.number().min(1).max(50).default(20),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        favoritesOnly: z.boolean().optional(),
      }),
    )
    .query(({ input, ctx }) => {
      if (input.favoritesOnly && !ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return surfSessionRepository.listPublished({
        spotId: input.spotId,
        cursor: input.cursor,
        limit: input.limit,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        favoriteUserId: input.favoritesOnly ? ctx.user?.id : undefined,
      });
    }),

  /** All sessions belonging to the authenticated photographer. */
  mine: protectedProcedure.query(({ ctx }) =>
    surfSessionRepository.findByPhotographer(ctx.user.id),
  ),

  /** Single session by ID. */
  byId: publicProcedure
    .input(z.uuid())
    .query(({ input: sessionId }) => surfSessionRepository.findPublishedById(sessionId)),

  /** Published media items for a session. */
  media: publicProcedure
    .input(z.uuid())
    .query(({ input: sessionId, ctx }) => mediaService.findPublishedBySession(sessionId, ctx.user?.id)),

  /** Removes a published session from public view; buyers keep access to already-purchased media. */
  retire: protectedProcedure
    .input(z.uuid())
    .mutation(({ input: sessionId, ctx }) =>
      surfSessionService.retire(ctx.user.id, sessionId),
    ),
});
