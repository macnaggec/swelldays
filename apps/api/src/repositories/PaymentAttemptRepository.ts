import {
  PaymentAttemptCreationState as PrismaPaymentAttemptCreationState,
  PaymentEnvironment as PrismaPaymentEnvironment,
  PaymentProvider as PrismaPaymentProvider,
  OrderStatus as PrismaOrderStatus,
  type Prisma,
} from '@prisma/client';
import type {
  PaymentAttemptCreationState,
  PaymentCreationFailureCode,
  PaymentEnvironment,
  PaymentIdentity,
  PaymentProvider,
} from 'server/domain/Payment';
import { PAYMENT_CREATION_FAILURE_CODES } from 'server/domain/Payment';
import { prisma } from 'server/db';
import { ConflictError } from 'server/errors';
import { runQuery } from 'server/lib/PrismaErrorMapper';

export type PaymentAttemptWriteClient = {
  paymentAttempt: Pick<Prisma.TransactionClient['paymentAttempt'], 'create'>;
};

export type PaymentAttemptRecord = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  creationState: PaymentAttemptCreationState;
  creationFailureCode: PaymentCreationFailureCode | null;
  environment: PaymentEnvironment | null;
  providerTransactionId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
  expectedAmountCents: number;
  expectedCurrency: string;
  providerTestMode: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PreparePaymentAttemptData = {
  orderId: string;
  provider: PaymentProvider;
  expectedAmountCents: number;
  expectedCurrency: string;
};

export type BindPaymentAttemptData = {
  attemptId: string;
  environment: PaymentEnvironment;
  providerTransactionId: string;
  checkoutUrl: string;
  expiresAt: Date | null;
  providerTestMode: boolean | null;
};

export interface IPaymentAttemptRepository {
  prepareAttempt(data: PreparePaymentAttemptData, db?: PaymentAttemptWriteClient): Promise<PaymentAttemptRecord>;
  bindProviderSession(data: BindPaymentAttemptData): Promise<PaymentAttemptRecord>;
  markCreationUnknown(attemptId: string, failureCode: PaymentCreationFailureCode): Promise<PaymentAttemptRecord>;
  markCreationFailed(attemptId: string, failureCode: PaymentCreationFailureCode): Promise<PaymentAttemptRecord>;
  findById(attemptId: string): Promise<PaymentAttemptRecord | null>;
  findByOrderId(orderId: string): Promise<PaymentAttemptRecord | null>;
  findByIdentity(identity: PaymentIdentity): Promise<PaymentAttemptRecord | null>;
  findForReconciliation(now: Date, staleBefore: Date, limit: number): Promise<PaymentAttemptRecord[]>;
  listUnresolved(limit: number): Promise<PaymentAttemptRecord[]>;
}

const PROVIDER_TO_PRISMA: Record<PaymentProvider, PrismaPaymentProvider> = {
  mock: PrismaPaymentProvider.MOCK,
  cryptocloud: PrismaPaymentProvider.CRYPTOCLOUD,
  paddle: PrismaPaymentProvider.PADDLE,
};
const PROVIDER_FROM_PRISMA: Record<PrismaPaymentProvider, PaymentProvider> = {
  [PrismaPaymentProvider.MOCK]: 'mock',
  [PrismaPaymentProvider.CRYPTOCLOUD]: 'cryptocloud',
  [PrismaPaymentProvider.PADDLE]: 'paddle',
};
const ENVIRONMENT_TO_PRISMA: Record<PaymentEnvironment, PrismaPaymentEnvironment> = {
  test: PrismaPaymentEnvironment.TEST,
  sandbox: PrismaPaymentEnvironment.SANDBOX,
  production: PrismaPaymentEnvironment.PRODUCTION,
};
const ENVIRONMENT_FROM_PRISMA: Record<PrismaPaymentEnvironment, PaymentEnvironment> = {
  [PrismaPaymentEnvironment.TEST]: 'test',
  [PrismaPaymentEnvironment.SANDBOX]: 'sandbox',
  [PrismaPaymentEnvironment.PRODUCTION]: 'production',
};
const STATE_TO_PRISMA: Record<PaymentAttemptCreationState, PrismaPaymentAttemptCreationState> = {
  creating: PrismaPaymentAttemptCreationState.CREATING,
  ready: PrismaPaymentAttemptCreationState.READY,
  unknown: PrismaPaymentAttemptCreationState.UNKNOWN,
  'definitively-failed': PrismaPaymentAttemptCreationState.DEFINITIVELY_FAILED,
};
const STATE_FROM_PRISMA: Record<PrismaPaymentAttemptCreationState, PaymentAttemptCreationState> = {
  [PrismaPaymentAttemptCreationState.CREATING]: 'creating',
  [PrismaPaymentAttemptCreationState.READY]: 'ready',
  [PrismaPaymentAttemptCreationState.UNKNOWN]: 'unknown',
  [PrismaPaymentAttemptCreationState.DEFINITIVELY_FAILED]: 'definitively-failed',
};

type PrismaAttempt = Awaited<ReturnType<typeof prisma.paymentAttempt.findUniqueOrThrow>>;

function failureCode(value: string | null): PaymentCreationFailureCode | null {
  if (value === null) return null;
  const match = PAYMENT_CREATION_FAILURE_CODES.find((code) => code === value);
  if (match !== undefined) return match;
  throw new ConflictError('Payment attempt has an invalid creation failure code');
}

function hasCompleteBinding(row: PrismaAttempt): boolean {
  return row.environment !== null && row.providerTransactionId !== null && row.checkoutUrl !== null;
}

function toRecord(row: PrismaAttempt): PaymentAttemptRecord {
  const creationState = row.creationState === PrismaPaymentAttemptCreationState.CREATING
    && hasCompleteBinding(row)
    ? 'ready'
    : STATE_FROM_PRISMA[row.creationState];
  return {
    id: row.id,
    orderId: row.orderId,
    provider: PROVIDER_FROM_PRISMA[row.provider],
    creationState,
    creationFailureCode: failureCode(row.creationFailureCode),
    environment: row.environment === null ? null : ENVIRONMENT_FROM_PRISMA[row.environment],
    providerTransactionId: row.providerTransactionId,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt,
    expectedAmountCents: row.expectedAmountCents,
    expectedCurrency: row.expectedCurrency,
    providerTestMode: row.providerTestMode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function bindingMatches(row: PaymentAttemptRecord, data: BindPaymentAttemptData): boolean {
  return row.environment === data.environment
    && row.providerTransactionId === data.providerTransactionId
    && row.checkoutUrl === data.checkoutUrl
    && row.expiresAt?.getTime() === data.expiresAt?.getTime()
    && row.providerTestMode === data.providerTestMode;
}

export class PaymentAttemptRepository implements IPaymentAttemptRepository {
  prepareAttempt(
    data: PreparePaymentAttemptData,
    db: PaymentAttemptWriteClient = prisma,
  ): Promise<PaymentAttemptRecord> {
    return runQuery(async () => toRecord(await db.paymentAttempt.create({
      data: {
        orderId: data.orderId,
        provider: PROVIDER_TO_PRISMA[data.provider],
        creationState: STATE_TO_PRISMA.creating,
        expectedAmountCents: data.expectedAmountCents,
        expectedCurrency: data.expectedCurrency,
      },
    })));
  }

  bindProviderSession(data: BindPaymentAttemptData): Promise<PaymentAttemptRecord> {
    return runQuery(async () => {
      const result = await prisma.paymentAttempt.updateMany({
        where: { id: data.attemptId, environment: null, providerTransactionId: null },
        data: {
          creationState: STATE_TO_PRISMA.ready,
          environment: ENVIRONMENT_TO_PRISMA[data.environment],
          providerTransactionId: data.providerTransactionId,
          checkoutUrl: data.checkoutUrl,
          expiresAt: data.expiresAt,
          providerTestMode: data.providerTestMode,
        },
      });
      const row = toRecord(await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: data.attemptId } }));
      if (result.count === 1 || bindingMatches(row, data)) return row;
      throw new ConflictError('Payment attempt is already bound to a different provider session');
    });
  }

  markCreationUnknown(attemptId: string, code: PaymentCreationFailureCode): Promise<PaymentAttemptRecord> {
    return runQuery(async () => {
      await prisma.paymentAttempt.updateMany({
        where: {
          id: attemptId,
          creationState: STATE_TO_PRISMA.creating,
          environment: null,
          providerTransactionId: null,
          checkoutUrl: null,
        },
        data: { creationState: STATE_TO_PRISMA.unknown, creationFailureCode: code },
      });
      return toRecord(await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } }));
    });
  }

  markCreationFailed(attemptId: string, code: PaymentCreationFailureCode): Promise<PaymentAttemptRecord> {
    return runQuery(async () => {
      await prisma.paymentAttempt.updateMany({
        where: {
          id: attemptId,
          creationState: {
            in: [STATE_TO_PRISMA.creating, STATE_TO_PRISMA.unknown, STATE_TO_PRISMA.ready],
          },
        },
        data: { creationState: STATE_TO_PRISMA['definitively-failed'], creationFailureCode: code },
      });
      return toRecord(await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } }));
    });
  }

  findById(attemptId: string): Promise<PaymentAttemptRecord | null> {
    return runQuery(async () => {
      const row = await prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
      return row === null ? null : toRecord(row);
    });
  }

  findByOrderId(orderId: string): Promise<PaymentAttemptRecord | null> {
    return runQuery(async () => {
      const rows = await prisma.paymentAttempt.findMany({
        where: { orderId }, orderBy: { createdAt: 'asc' }, take: 2,
      });
      if (rows.length > 1) throw new ConflictError('Order has multiple payment attempts');
      return rows[0] === undefined ? null : toRecord(rows[0]);
    });
  }

  findByIdentity(identity: PaymentIdentity): Promise<PaymentAttemptRecord | null> {
    return runQuery(async () => {
      const row = await prisma.paymentAttempt.findUnique({
        where: {
          provider_environment_providerTransactionId: {
            provider: PROVIDER_TO_PRISMA[identity.provider],
            environment: ENVIRONMENT_TO_PRISMA[identity.environment],
            providerTransactionId: identity.providerTransactionId,
          },
        },
      });
      return row === null ? null : toRecord(row);
    });
  }

  findForReconciliation(now: Date, staleBefore: Date, limit: number): Promise<PaymentAttemptRecord[]> {
    return runQuery(async () => (await prisma.paymentAttempt.findMany({
      where: {
        order: { status: PrismaOrderStatus.PENDING },
        OR: [
          { creationState: STATE_TO_PRISMA.creating, updatedAt: { lte: staleBefore } },
          { creationState: STATE_TO_PRISMA.unknown, environment: { not: null },
            providerTransactionId: { not: null }, checkoutUrl: { not: null } },
          { creationState: STATE_TO_PRISMA.ready, OR: [
            { updatedAt: { lte: staleBefore } },
            { expiresAt: { lte: now } },
          ] },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: Math.max(1, Math.min(100, limit)),
    })).map(toRecord));
  }

  listUnresolved(limit: number): Promise<PaymentAttemptRecord[]> {
    return runQuery(async () => (await prisma.paymentAttempt.findMany({
      where: { creationState: { in: [STATE_TO_PRISMA.creating, STATE_TO_PRISMA.unknown] } },
      orderBy: { updatedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    })).map(toRecord));
  }
}

export const paymentAttemptRepository = new PaymentAttemptRepository();
