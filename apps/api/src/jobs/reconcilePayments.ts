import type {
  IPaymentService,
  PaymentNotificationRunSummary,
  PaymentReconciliationSummary,
} from 'server/services/PaymentService';
import { paymentService } from 'server/services/PaymentService';
import { logger } from 'server/lib/logger';

export type PaymentReconciliationJobSummary = {
  reconciliation: PaymentReconciliationSummary;
  notifications: PaymentNotificationRunSummary;
};

export async function reconcilePayments(
  payments: Pick<IPaymentService, 'reconcilePaymentAttempts' | 'processPendingNotifications'> = paymentService,
): Promise<PaymentReconciliationJobSummary> {
  const reconciliation = await payments.reconcilePaymentAttempts();
  const notifications = await payments.processPendingNotifications();
  logger.info('[payment-reconciler] run completed', { reconciliation, notifications });
  return { reconciliation, notifications };
}
