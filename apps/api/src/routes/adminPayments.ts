import { z } from 'zod';
import { PAYMENT_NOTIFICATION_STATUSES } from 'server/domain/PaymentNotification';
import { NotFoundError } from 'server/errors';
import { reconcilePayments } from 'server/jobs/reconcilePayments';
import { paymentService } from 'server/services/PaymentService';
import { adminProcedure, router } from 'server/trpc';

export const adminPaymentsRouter = router({
  list: adminProcedure.input(z.object({
    status: z.enum(PAYMENT_NOTIFICATION_STATUSES).optional(),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })).query(({ input }) => paymentService.getOperatorStatus({ ...input, limit: input.limit ?? 50 })),

  replay: adminProcedure.input(z.object({ notificationId: z.string().uuid() })).mutation(async ({ input }) => {
    const notification = await paymentService.replayNotification(input.notificationId);
    if (notification === null) throw new NotFoundError('PaymentNotification');
    return notification;
  }),

  runReconciliation: adminProcedure.mutation(() => reconcilePayments()),
});
