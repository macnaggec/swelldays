import { z } from 'zod';
import { router, adminProcedure } from 'server/trpc';
import { ledgerService } from 'server/services/LedgerService';
import { OPERATOR_PAYOUT_STATUSES } from 'server/repositories/LedgerRepository';

const payoutRequestIdSchema = z.object({
  payoutRequestId: z.string().uuid(),
});

export const adminLedgerRouter = router({
  listPayouts: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().uuid().optional(),
      statuses: z.array(z.enum(OPERATOR_PAYOUT_STATUSES)).min(1).max(OPERATOR_PAYOUT_STATUSES.length).optional(),
    }).default({ limit: 50 }))
    .query(({ input }) => ledgerService.listOperatorPayouts(input)),

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
