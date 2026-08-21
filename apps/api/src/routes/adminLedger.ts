import { z } from 'zod';
import { router, adminProcedure } from 'server/trpc';
import { ledgerService } from 'server/services/LedgerService';

const payoutRequestIdSchema = z.object({
  payoutRequestId: z.string().uuid(),
});

export const adminLedgerRouter = router({
  listPayouts: adminProcedure.query(() =>
    ledgerService.listOperatorPayouts(),
  ),

  checkInvariant: adminProcedure.query(() =>
    ledgerService.checkInvariant(),
  ),

  markProcessing: adminProcedure
    .input(payoutRequestIdSchema)
    .mutation(({ input }) =>
      ledgerService.markPayoutProcessing(input.payoutRequestId),
    ),

  complete: adminProcedure
    .input(payoutRequestIdSchema.extend({
      externalTransferId: z.string().min(1),
    }))
    .mutation(({ input }) =>
      ledgerService.completePayout(input.payoutRequestId, input.externalTransferId),
    ),

  reject: adminProcedure
    .input(payoutRequestIdSchema.extend({
      note: z.string().min(1),
    }))
    .mutation(({ input }) =>
      ledgerService.rejectPayout(input.payoutRequestId, input.note),
    ),
});
