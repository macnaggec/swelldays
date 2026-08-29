import { z } from 'zod';
import { router, adminProcedure } from 'server/trpc';
import { spotRepository } from 'server/repositories/SpotRepository';
import { spotNameSchema, spotLocationSchema } from '@swelldays/contracts';
import type { Spot } from '@swelldays/contracts';

export const adminSpotsRouter = router({
  update: adminProcedure
    .input(
      z.object({
        id: z.string().min(1),
        name: spotNameSchema,
        location: spotLocationSchema,
        lat: z.number(),
        lng: z.number(),
      }),
    )
    .mutation(({ input }): Promise<Spot> =>
      spotRepository.updateSpot(input.id, {
        name: input.name,
        location: input.location,
        lat: input.lat,
        lng: input.lng,
      })
    ),
});
