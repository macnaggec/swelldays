import { router, protectedProcedure } from 'server/trpc';
import { ledgerService } from 'server/services/LedgerService';

export const ledgerRouter = router({
  summary: protectedProcedure.query(({ ctx }) =>
    ledgerService.getSummary(ctx.user.id),
  ),

  requestPayout: protectedProcedure.mutation(({ ctx }) =>
    ledgerService.requestPayout(ctx.user.id),
  ),
});
