import { z } from 'zod';
import { PAYMENT_NOTIFICATION_STATUSES } from 'server/domain/PaymentNotification';
import { PAYMENT_ADJUSTMENT_ACTIONS, PAYMENT_ADJUSTMENT_PROVIDER_STATUSES } from 'server/domain/PaymentAdjustment';
import { NotFoundError } from 'server/errors';
import { reconcilePayments } from 'server/jobs/reconcilePayments';
import { paymentService } from 'server/services/PaymentService';
import { paymentAdjustmentService } from 'server/services/PaymentAdjustmentService';
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

  listExceptions: adminProcedure.input(z.object({ cursor: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).default(50) }))
    .query(({ input }) => paymentAdjustmentService.listPending(input.limit, input.cursor)),

  recordManualAdjustment: adminProcedure.input(z.object({ paymentAttemptId: z.string().uuid(),
    providerAdjustmentId: z.string().trim().min(1).max(200), action: z.enum(PAYMENT_ADJUSTMENT_ACTIONS),
    status: z.enum(PAYMENT_ADJUSTMENT_PROVIDER_STATUSES), amountCents: z.number().int().positive(),
    currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
    occurredAt: z.date(), updatedAt: z.date(), note: z.string().trim().min(1).max(500) }))
    .mutation(({ input, ctx }) => paymentAdjustmentService.recordManual(input, ctx.user.id)),

  applyAdjustment: adminProcedure.input(z.object({ adjustmentId: z.string().uuid(),
    allocations: z.array(z.object({ paidOrderLineId: z.string().uuid(), amountCents: z.number().int().positive() })).min(1).max(100),
    revokeEntitlements: z.boolean(), reversesAdjustmentId: z.string().uuid().optional(),
    note: z.string().trim().min(1).max(500) })).mutation(({ input, ctx }) =>
      paymentAdjustmentService.apply(input, ctx.user.id)),

  dismissAdjustment: adminProcedure.input(z.object({ adjustmentId: z.string().uuid(),
    note: z.string().trim().min(1).max(500) })).mutation(({ input, ctx }) =>
      paymentAdjustmentService.dismiss(input.adjustmentId, input.note, ctx.user.id)),

  resolveCompensation: adminProcedure.input(z.object({ paidOrderLineId: z.string().uuid(), adjustmentId: z.string().uuid(),
    note: z.string().trim().min(1).max(500) })).mutation(({ input, ctx }) =>
      paymentAdjustmentService.resolveCompensation(input.paidOrderLineId, input.adjustmentId, input.note, ctx.user.id)),
});
