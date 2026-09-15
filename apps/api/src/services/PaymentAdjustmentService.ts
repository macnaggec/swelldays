import type { ApplyPaymentAdjustmentCommand } from 'server/domain/PaymentAdjustment';
import type { RecordManualPaymentAdjustmentCommand } from 'server/domain/PaymentAdjustment';
import { BadRequestError } from 'server/errors';
import { paymentAdjustmentRepository, type PaymentAdjustmentRepository } from 'server/repositories/PaymentAdjustmentRepository';

export class PaymentAdjustmentService {
  constructor(private adjustments: Pick<PaymentAdjustmentRepository,
    'listPending' | 'recordManual' | 'apply' | 'dismiss' | 'resolveCompensation'>) {}

  listPending(limit: number, cursor?: string) { return this.adjustments.listPending(limit, cursor); }

  recordManual(command: Omit<RecordManualPaymentAdjustmentCommand, 'operatorId'>, operatorId: string) {
    this.validateNote(command.note);
    if (!Number.isSafeInteger(command.amountCents) || command.amountCents <= 0 || !/^[A-Za-z]{3}$/.test(command.currency)
      || command.providerAdjustmentId.trim().length === 0 || command.providerAdjustmentId.length > 200
      || Number.isNaN(command.occurredAt.getTime()) || Number.isNaN(command.updatedAt.getTime())
      || command.updatedAt < command.occurredAt) {
      throw new BadRequestError('Invalid manual adjustment facts');
    }
    return this.adjustments.recordManual({ ...command, operatorId });
  }

  apply(command: Omit<ApplyPaymentAdjustmentCommand, 'operatorId'>, operatorId: string) {
    this.validateNote(command.note);
    return this.adjustments.apply({ ...command, operatorId });
  }

  dismiss(adjustmentId: string, note: string, operatorId: string) {
    this.validateNote(note);
    return this.adjustments.dismiss(adjustmentId, note, operatorId);
  }

  resolveCompensation(paidOrderLineId: string, adjustmentId: string, note: string, operatorId: string) {
    this.validateNote(note);
    return this.adjustments.resolveCompensation(paidOrderLineId, adjustmentId, note, operatorId);
  }

  private validateNote(note: string) {
    if (note.trim().length === 0 || note.length > 500) throw new BadRequestError('Operator note is required');
  }
}

export const paymentAdjustmentService = new PaymentAdjustmentService(paymentAdjustmentRepository);
