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
import { acquireActiveAccountLock } from 'server/lib/TransactionSerialization';

export const OPERATOR_PAYOUT_STATUSES = [
  PayoutStatus.PENDING,
  PayoutStatus.PROCESSING,
  PayoutStatus.COMPLETED,
  PayoutStatus.REJECTED,
] as const;

export type OperatorPayoutStatus = (typeof OPERATOR_PAYOUT_STATUSES)[number];

export type LedgerSummaryRecords = {
  user: Pick<User, 'id' | 'balance'> | null;
  recentTransactions: Transaction[];
  payoutRequests: PayoutRequest[];
  pendingPayoutCents: number;
  heldForReviewCents?: number;
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

export type ListOperatorPayoutsInput = {
  limit: number;
  cursor?: string;
  statuses?: readonly OperatorPayoutStatus[];
};

export type OperatorPayoutPage = {
  items: OperatorPayoutRequest[];
  nextCursor: string | null;
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
  paidOrderLineId: string;
};

export type RecordAdjustmentInput = {
  photographerId: string;
  amount: number;
  paymentAdjustmentAllocationId: string;
};

export interface ILedgerRepository {
  getSummaryRecords(photographerId: string): Promise<LedgerSummaryRecords>;
  listOperatorPayouts(input: ListOperatorPayoutsInput): Promise<OperatorPayoutPage>;
  reservePayout(input: ReservePayoutInput): Promise<PayoutReservation>;
  markPayoutProcessing(payoutRequestId: string): Promise<PayoutReservation>;
  completePayout(payoutRequestId: string, externalTransferId: string): Promise<PayoutReservation>;
  rejectPayout(payoutRequestId: string, note: string): Promise<PayoutReservation>;
  findInvariantViolations(): Promise<LedgerInvariantViolation[]>;
  recordSale(tx: Prisma.TransactionClient, input: RecordSaleInput): Promise<void>;
  recordAdjustment(tx: Prisma.TransactionClient, input: RecordAdjustmentInput): Promise<void>;
  forfeitBalance(tx: Prisma.TransactionClient, userId: string): Promise<void>;
}

export class LedgerRepository implements ILedgerRepository {
  getSummaryRecords(photographerId: string): Promise<LedgerSummaryRecords> {
    return runQuery(async () => {
      const [user, recentTransactions, payoutRequests, pendingPayout] = await Promise.all([
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
        prisma.payoutRequest.aggregate({
          where: {
            photographerId,
            status: { in: [PayoutStatus.PENDING, PayoutStatus.PROCESSING] },
          },
          _sum: { amount: true },
        }),
      ]);

      const heldRows = await prisma.paidOrderLine.findMany({
        where: { sellerId: photographerId, deliveryStatus: 'DELIVERED',
          paymentAttempt: { adjustments: { some: { resolution: 'PENDING_REVIEW' } } } },
        distinct: ['id'], select: { sellerEarnings: true,
          allocations: { where: { paymentAdjustment: { resolution: 'APPLIED' } }, select: { sellerLedgerAmount: true } } },
      });
      return { user, recentTransactions, payoutRequests, pendingPayoutCents: pendingPayout._sum.amount ?? 0,
        heldForReviewCents: heldRows.reduce((sum, row) => sum + Math.max(0, row.sellerEarnings
          + row.allocations.reduce((adjusted, allocation) => adjusted + allocation.sellerLedgerAmount, 0)), 0) };
    });
  }

  reservePayout(input: ReservePayoutInput): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        await acquireActiveAccountLock(tx, input.photographerId);
        const user = await tx.user.findUnique({ where: { id: input.photographerId }, select: { balance: true } });
        const held = await tx.paidOrderLine.findMany({ where: { sellerId: input.photographerId,
          deliveryStatus: 'DELIVERED', paymentAttempt: { adjustments: { some: { resolution: 'PENDING_REVIEW' } } } },
          distinct: ['id'], select: { sellerEarnings: true,
            allocations: { where: { paymentAdjustment: { resolution: 'APPLIED' } }, select: { sellerLedgerAmount: true } } } });
        const heldForReview = held.reduce((sum, row) => sum + Math.max(0, row.sellerEarnings
          + row.allocations.reduce((adjusted, allocation) => adjusted + allocation.sellerLedgerAmount, 0)), 0);
        if (user === null || input.amountCents > user.balance - heldForReview) {
          throw new BadRequestError('Insufficient available balance');
        }
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

  listOperatorPayouts(input: ListOperatorPayoutsInput): Promise<OperatorPayoutPage> {
    const limit = Math.max(1, Math.min(100, input.limit));
    return runQuery(async () => {
      if (input.cursor !== undefined) {
        await prisma.payoutRequest.findUniqueOrThrow({
          where: { id: input.cursor },
          select: { id: true },
        });
      }
      const rows = await prisma.payoutRequest.findMany({
        where: input.statuses === undefined ? undefined : { status: { in: [...input.statuses] } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(input.cursor === undefined ? {} : { cursor: { id: input.cursor }, skip: 1 }),
        include: {
          photographer: { select: { id: true, email: true, name: true } },
        },
      });
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
    });
  }

  markPayoutProcessing(payoutRequestId: string): Promise<PayoutReservation> {
    return runQuery(() =>
      prisma.$transaction(async (tx) => {
        const existing = await tx.payoutRequest.findUnique({ where: { id: payoutRequestId } });
        if (existing === null) throw new NotFoundError('Payout request');
        await acquireActiveAccountLock(tx, existing.photographerId);
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
        const existing = await tx.payoutRequest.findUnique({ where: { id: payoutRequestId } });
        if (existing === null) throw new NotFoundError('Payout request');
        await acquireActiveAccountLock(tx, existing.photographerId);
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
        await acquireActiveAccountLock(tx, existing.photographerId);
        const current = await tx.payoutRequest.findUniqueOrThrow({ where: { id: payoutRequestId } });
        if (
          current.status !== PayoutStatus.PENDING &&
          current.status !== PayoutStatus.PROCESSING
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
          where: { id: current.transactionId },
          data: { status: TransactionStatus.FAILED },
        });
        await tx.user.update({
          where: { id: current.photographerId },
          data: { balance: { increment: current.amount } },
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
    // Sequential, not Promise.all: the balance row is taken first so every
    // writer touches it in the same order.
    await acquireActiveAccountLock(tx, input.photographerId);
    await tx.user.update({
      where: { id: input.photographerId },
      data: { balance: { increment: input.amount } },
    });
    await tx.transaction.create({
      data: {
        userId: input.photographerId,
        amount: input.amount,
        type: TransactionType.SALE,
        externalOrderId: input.externalOrderId,
        paidOrderLineId: input.paidOrderLineId,
        status: TransactionStatus.COMPLETED,
      },
    });
  }

  async recordAdjustment(tx: Prisma.TransactionClient, input: RecordAdjustmentInput): Promise<void> {
    await acquireActiveAccountLock(tx, input.photographerId);
    await tx.user.update({
      where: { id: input.photographerId },
      data: { balance: { increment: input.amount } },
    });
    await tx.transaction.create({
      data: {
        userId: input.photographerId,
        amount: input.amount,
        type: TransactionType.ADJUSTMENT,
        status: TransactionStatus.COMPLETED,
        paymentAdjustmentAllocationId: input.paymentAdjustmentAllocationId,
      },
    });
  }

  async forfeitBalance(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await acquireActiveAccountLock(tx, userId);
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

    if (user.balance > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: user.balance } },
      });
    }
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
