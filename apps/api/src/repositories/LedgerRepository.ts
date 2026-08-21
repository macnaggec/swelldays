import type {
  PayoutRequest,
  Prisma,
  Transaction,
  User,
} from '@prisma/client';
import {
  PayoutStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { BadRequestError, NotFoundError } from 'server/errors';

export type LedgerSummaryRecords = {
  user: Pick<User, 'id' | 'balance'> | null;
  recentTransactions: Transaction[];
  payoutRequests: PayoutRequest[];
};

export type ReservePayoutInput = {
  photographerId: string;
  amountCents: number;
};

export type PayoutReservation = {
  payoutRequest: PayoutRequest;
  transaction: Transaction;
};

export type OperatorPayoutRequest = PayoutRequest & {
  photographer: {
    id: string;
    email: string;
    name: string | null;
  };
};

export type LedgerInvariantViolation = {
  userId: string;
  balance: number;
  expectedBalance: number;
};

export type RecordSaleInput = {
  photographerId: string;
  amount: number;
  externalOrderId: string;
};

export interface ILedgerRepository {
  getSummaryRecords(photographerId: string): Promise<LedgerSummaryRecords>;
  listOperatorPayouts(): Promise<OperatorPayoutRequest[]>;
  reservePayout(input: ReservePayoutInput): Promise<PayoutReservation>;
  markPayoutProcessing(payoutRequestId: string): Promise<PayoutReservation>;
  completePayout(payoutRequestId: string, externalTransferId: string): Promise<PayoutReservation>;
  rejectPayout(payoutRequestId: string, note: string): Promise<PayoutReservation>;
  findInvariantViolations(): Promise<LedgerInvariantViolation[]>;
  recordSale(tx: Prisma.TransactionClient, input: RecordSaleInput): Promise<void>;
  forfeitBalance(tx: Prisma.TransactionClient, userId: string): Promise<void>;
}

export class LedgerRepository implements ILedgerRepository {
  getSummaryRecords(photographerId: string): Promise<LedgerSummaryRecords> {
    return runQuery(async () => {
      const [user, recentTransactions, payoutRequests] = await Promise.all([
        prisma.user.findUnique({
          where: { id: photographerId },
          select: { id: true, balance: true },
        }),
        prisma.transaction.findMany({
          where: { userId: photographerId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        prisma.payoutRequest.findMany({
          where: { photographerId },
          orderBy: { requestedAt: 'desc' },
          take: 20,
        }),
      ]);

      return { user, recentTransactions, payoutRequests };
    });
  }

  reservePayout(input: ReservePayoutInput): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const reserved = await tx.user.updateMany({
          where: {
            id: input.photographerId,
            balance: { gte: input.amountCents },
          },
          data: { balance: { decrement: input.amountCents } },
        });

        if (reserved.count !== 1) {
          throw new BadRequestError('Insufficient available balance');
        }

        const transaction = await tx.transaction.create({
          data: {
            userId: input.photographerId,
            amount: -input.amountCents,
            type: TransactionType.PAYOUT,
            status: TransactionStatus.PENDING,
          },
        });

        const payoutRequest = await tx.payoutRequest.create({
          data: {
            photographerId: input.photographerId,
            transactionId: transaction.id,
            amount: input.amountCents,
            status: PayoutStatus.PENDING,
          },
        });

        return { payoutRequest, transaction };
      })
    );
  }

  listOperatorPayouts(): Promise<OperatorPayoutRequest[]> {
    return runQuery(() =>
      prisma.payoutRequest.findMany({
        orderBy: { requestedAt: 'asc' },
        take: 100,
        include: {
          photographer: { select: { id: true, email: true, name: true } },
        },
      })
    );
  }

  markPayoutProcessing(payoutRequestId: string): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const updated = await tx.payoutRequest.updateMany({
          where: { id: payoutRequestId, status: PayoutStatus.PENDING },
          data: { status: PayoutStatus.PROCESSING },
        });

        if (updated.count !== 1) {
          throw new BadRequestError('Payout request cannot be marked processing');
        }

        const payoutRequest = await tx.payoutRequest.findUniqueOrThrow({
          where: { id: payoutRequestId },
        });
        const transaction = await tx.transaction.findUniqueOrThrow({
          where: { id: payoutRequest.transactionId },
        });

        return { payoutRequest, transaction };
      })
    );
  }

  completePayout(payoutRequestId: string, externalTransferId: string): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const updated = await tx.payoutRequest.updateMany({
          where: { id: payoutRequestId, status: PayoutStatus.PROCESSING },
          data: {
            status: PayoutStatus.COMPLETED,
            externalTransferId,
            processedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new BadRequestError('Payout request cannot be completed');
        }

        const payoutRequest = await tx.payoutRequest.findUniqueOrThrow({
          where: { id: payoutRequestId },
        });
        const transaction = await tx.transaction.update({
          where: { id: payoutRequest.transactionId },
          data: { status: TransactionStatus.COMPLETED },
        });

        return { payoutRequest, transaction };
      })
    );
  }

  rejectPayout(payoutRequestId: string, note: string): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.payoutRequest.findUnique({
          where: { id: payoutRequestId },
        });

        if (!existing) {
          throw new NotFoundError('Payout request');
        }
        if (
          existing.status !== PayoutStatus.PENDING &&
          existing.status !== PayoutStatus.PROCESSING
        ) {
          throw new BadRequestError('Payout request cannot be rejected');
        }

        const updated = await tx.payoutRequest.updateMany({
          where: {
            id: payoutRequestId,
            status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
          },
          data: {
            status: PayoutStatus.REJECTED,
            note,
            processedAt: new Date(),
          },
        });

        if (updated.count !== 1) {
          throw new BadRequestError('Payout request cannot be rejected');
        }

        const transaction = await tx.transaction.update({
          where: { id: existing.transactionId },
          data: { status: TransactionStatus.FAILED },
        });
        await tx.user.update({
          where: { id: existing.photographerId },
          data: { balance: { increment: existing.amount } },
        });
        const payoutRequest = await tx.payoutRequest.findUniqueOrThrow({
          where: { id: payoutRequestId },
        });

        return { payoutRequest, transaction };
      })
    );
  }

  // Tx-scoped writers: the only place a balance mutation may pair with its
  // Transaction row. Callers pass their own transaction client so multi-table
  // commits (fulfillment, account deletion) stay atomic.
  async recordSale(tx: Prisma.TransactionClient, input: RecordSaleInput): Promise<void> {
    await Promise.all([
      tx.user.update({
        where: { id: input.photographerId },
        data: { balance: { increment: input.amount } },
      }),
      tx.transaction.create({
        data: {
          userId: input.photographerId,
          amount: input.amount,
          type: TransactionType.SALE,
          externalOrderId: input.externalOrderId,
          status: TransactionStatus.COMPLETED,
        },
      }),
    ]);
  }

  async forfeitBalance(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });
    if (!user) throw new NotFoundError('User');

    // Record the forfeited balance so the ledger still explains where the money went
    if (user.balance > 0) {
      await tx.transaction.create({
        data: {
          userId,
          amount: -user.balance,
          type: TransactionType.FORFEIT,
          status: TransactionStatus.COMPLETED,
        },
      });
    }

    await tx.user.update({
      where: { id: userId },
      data: { balance: 0 },
    });
  }

  findInvariantViolations(): Promise<LedgerInvariantViolation[]> {
    return runQuery(async () => {
      const [users, grouped] = await Promise.all([
        prisma.user.findMany({ select: { id: true, balance: true } }),
        prisma.transaction.groupBy({
          by: ['userId'],
          where: { status: { in: [TransactionStatus.COMPLETED, TransactionStatus.PENDING] } },
          _sum: { amount: true },
        }),
      ]);

      const expectedByUserId = new Map(grouped.map((g) => [g.userId, g._sum.amount ?? 0]));

      return users
        .map((user) => ({
          userId: user.id,
          balance: user.balance,
          expectedBalance: expectedByUserId.get(user.id) ?? 0,
        }))
        .filter((v) => v.balance !== v.expectedBalance);
    });
  }
}

export const ledgerRepository = new LedgerRepository();
