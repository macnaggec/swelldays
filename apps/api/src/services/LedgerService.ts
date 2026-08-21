import {
  PayoutStatus,
  type PayoutRequest,
  type Transaction,
} from '@prisma/client';
import {
  ledgerRepository,
  type ILedgerRepository,
  type LedgerInvariantViolation,
  type OperatorPayoutRequest,
  type PayoutReservation,
} from 'server/repositories/LedgerRepository';
import { BadRequestError, NotFoundError } from 'server/errors';

const PAYOUT_THRESHOLD_CENTS = 2000;

export type LedgerTransactionSummary = Pick<
  Transaction,
  'id' | 'amount' | 'type' | 'status' | 'externalOrderId' | 'createdAt'
>;

export type LedgerPayoutRequestSummary = Pick<
  PayoutRequest,
  'id' | 'amount' | 'status' | 'externalTransferId' | 'note' | 'requestedAt' | 'processedAt'
>;

export type LedgerSummary = {
  availableBalanceCents: number;
  pendingPayoutCents: number;
  payoutThresholdCents: number;
  recentTransactions: LedgerTransactionSummary[];
  payoutRequests: LedgerPayoutRequestSummary[];
};

export class LedgerService {
  constructor(private ledger: ILedgerRepository) {}

  async getSummary(photographerId: string): Promise<LedgerSummary> {
    const records = await this.ledger.getSummaryRecords(photographerId);
    if (!records.user) throw new NotFoundError('User');

    return {
      availableBalanceCents: records.user.balance,
      pendingPayoutCents: records.payoutRequests.reduce((total, request) => {
        if (
          request.status === PayoutStatus.PENDING ||
          request.status === PayoutStatus.PROCESSING
        ) {
          return total + request.amount;
        }
        return total;
      }, 0),
      payoutThresholdCents: PAYOUT_THRESHOLD_CENTS,
      recentTransactions: records.recentTransactions.map((transaction) => ({
        id: transaction.id,
        amount: transaction.amount,
        type: transaction.type,
        status: transaction.status,
        externalOrderId: transaction.externalOrderId,
        createdAt: transaction.createdAt,
      })),
      payoutRequests: records.payoutRequests.map((request) => ({
        id: request.id,
        amount: request.amount,
        status: request.status,
        externalTransferId: request.externalTransferId,
        note: request.note,
        requestedAt: request.requestedAt,
        processedAt: request.processedAt,
      })),
    };
  }

  async requestPayout(photographerId: string): Promise<LedgerSummary> {
    const summary = await this.getSummary(photographerId);

    if (summary.availableBalanceCents < PAYOUT_THRESHOLD_CENTS) {
      throw new BadRequestError('Minimum payout is $20.00');
    }

    await this.ledger.reservePayout({
      photographerId,
      amountCents: summary.availableBalanceCents,
    });

    return this.getSummary(photographerId);
  }

  listOperatorPayouts(): Promise<OperatorPayoutRequest[]> {
    return this.ledger.listOperatorPayouts();
  }

  markPayoutProcessing(payoutRequestId: string): Promise<PayoutReservation> {
    return this.ledger.markPayoutProcessing(payoutRequestId);
  }

  completePayout(payoutRequestId: string, externalTransferId: string): Promise<PayoutReservation> {
    return this.ledger.completePayout(payoutRequestId, externalTransferId);
  }

  rejectPayout(payoutRequestId: string, note: string): Promise<PayoutReservation> {
    return this.ledger.rejectPayout(payoutRequestId, note);
  }

  checkInvariant(): Promise<LedgerInvariantViolation[]> {
    return this.ledger.findInvariantViolations();
  }
}

export const ledgerService = new LedgerService(ledgerRepository);
