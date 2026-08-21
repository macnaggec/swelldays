import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from 'server/trpc';
import { mediaRepository } from 'server/repositories/MediaRepository';
import { mediaService } from 'server/services/MediaService';
import { spotRepository } from 'server/repositories/SpotRepository';
import { SPOT_STATUS } from '@wave-atlas/contracts';
import type { Spot } from '@wave-atlas/contracts';
import { spotNameSchema, spotLocationSchema, spotAliasSchema } from '@wave-atlas/contracts';
import { NotFoundError } from 'shared/errors';

export const spotsRouter = router({
  list: publicProcedure
    .input(z.string().optional())
    .query(({ input: search }): Promise<Spot[]> => spotRepository.findSpotList({ search })),

  byId: publicProcedure
    .input(z.string().min(1))
    .query(async ({ input: id }): Promise<Spot | null> => {
      const row = await spotRepository.findSpotById(id);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        location: row.location,
        coords: row.coords,
        status: row.status,
      };
    }),

  withinBounds: publicProcedure
    .input(z.object({
      swLat: z.number(),
      swLng: z.number(),
      neLat: z.number(),
      neLng: z.number(),
    }))
    .query(({ input }): Promise<Spot[]> =>
      spotRepository.findSpotsByBounds(input.swLat, input.swLng, input.neLat, input.neLng)
    ),

  /** Returns spots within 300 m so the create flow can warn about a possible duplicate. */
  nearby: publicProcedure
    .input(z.object({ lat: z.number(), lng: z.number() }))
    .query(({ input }): Promise<Spot[]> => spotRepository.findSpotsNearby(input.lat, input.lng, 300)),

  /** Creates a new spot. Nearby results are advisory; users may intentionally create close spots. */
  create: protectedProcedure
    .input(
      z.object({
        name: spotNameSchema,
        location: spotLocationSchema,
        lat: z.number(),
        lng: z.number(),
      }),
    )
    .mutation(({ input, ctx }): Promise<Spot> =>
      spotRepository.createSpot({
        name: input.name,
        location: input.location,
        lat: input.lat,
        lng: input.lng,
        status: SPOT_STATUS.UNVERIFIED,
        creatorId: ctx.user.id,
      })
    ),

  /** Appends an alias to an existing spot (instant, no moderation). */
  addAlias: protectedProcedure
    .input(z.object({ spotId: z.string(), alias: spotAliasSchema }))
    .mutation(async ({ input }) => {
      const spot = await spotRepository.findSpotById(input.spotId);
      if (!spot) throw new NotFoundError('Spot');
      if (spot.aliases.includes(input.alias)) return { ok: true }; // idempotent

      await spotRepository.pushSpotAlias(input.spotId, input.alias);

      return { ok: true };
    }),

  /**
   * Published media, optionally scoped to a single spot; unfiltered lists across all spots.
   * Bidirectional: `direction: 'backward'` (set by TanStack's fetchPreviousPage) fetches
   * newer items than `cursor` instead of older ones, for scrolling back toward the present
   * after `anchorCapturedAt` seeds a jump into distant history.
   */
  mediaFeed: publicProcedure
    .input(
      z.object({
        spotId: z.string().optional(),
        cursor: z.string().optional(),
        direction: z.enum(['forward', 'backward']).optional(),
        anchorCapturedAt: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).default(30),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        favoriteSpotsOnly: z.boolean().optional(),
      }),
    )
    .query(({ input, ctx }) => {
      if (input.favoriteSpotsOnly && !ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      const scope = {
        spotId: input.spotId,
        sortOrder: input.sortOrder,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        favoriteUserId: input.favoriteSpotsOnly ? ctx.user?.id : undefined,
      };
      if (input.direction === 'backward') {
        if (!input.cursor) throw new TRPCError({ code: 'BAD_REQUEST', message: 'cursor is required for direction "backward"' });
        return mediaService.findPublishedBySpotBefore({ ...scope, cursor: input.cursor, limit: input.limit }, ctx.user?.id);
      }
      return mediaService.findPublishedBySpot({
        ...scope,
        cursor: input.cursor,
        anchorCapturedAt: input.anchorCapturedAt,
        limit: input.limit,
      }, ctx.user?.id);
    }),

  /** Complete compact chronology for the date menu; cards remain paginated by mediaFeed. */
  mediaDateIndex: publicProcedure
    .input(
      z.object({
        spotId: z.string().optional(),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        favoriteSpotsOnly: z.boolean().optional(),
      }),
    )
    .query(({ input, ctx }) => {
      if (input.favoriteSpotsOnly && !ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
      return mediaService.findPublishedDates({
        spotId: input.spotId,
        sortOrder: input.sortOrder,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        favoriteUserId: input.favoriteSpotsOnly ? ctx.user?.id : undefined,
      });
    }),

  card: publicProcedure.input(z.string()).query(({ input: id }) => spotRepository.findSpotCard(id)),

  isFavorited: protectedProcedure
    .input(z.string())
    .query(({ input: spotId, ctx }) => spotRepository.isSpotFavorited(spotId, ctx.user.id)),

  toggleFavorite: protectedProcedure
    .input(z.string())
    .mutation(({ input: spotId, ctx }) => spotRepository.toggleSpotFavorite(spotId, ctx.user.id)),

  drafts: protectedProcedure
    .input(z.string())
    .query(({ input: spotId, ctx }) => mediaRepository.findDraftsBySpot(spotId, ctx.user.id)),
});
