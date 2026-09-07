import {
  PaymentEnvironment as PrismaPaymentEnvironment,
  PaymentProvider as PrismaPaymentProvider,
} from '@prisma/client';
import type { PaymentEnvironment, PaymentIdentity, PaymentProvider } from 'server/domain/Payment';
import { prisma } from 'server/db';
import { ConflictError } from 'server/errors';
import { runQuery } from 'server/lib/PrismaErrorMapper';

export type PaymentAttemptRecord = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  environment: PaymentEnvironment | null;
  providerTransactionId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date | null;
  expectedAmountCents: number;
  expectedCurrency: string;
  providerTestMode: boolean | null;
};

export type CreatePaymentAttemptData = {
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
  createAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord>;
  bindProviderSession(data: BindPaymentAttemptData): Promise<PaymentAttemptRecord>;
  findByIdentity(identity: PaymentIdentity): Promise<PaymentAttemptRecord | null>;
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

type PrismaAttempt = Awaited<ReturnType<typeof prisma.paymentAttempt.findUniqueOrThrow>>;

function toRecord(row: PrismaAttempt): PaymentAttemptRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    provider: PROVIDER_FROM_PRISMA[row.provider],
    environment: row.environment === null ? null : ENVIRONMENT_FROM_PRISMA[row.environment],
    providerTransactionId: row.providerTransactionId,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt,
    expectedAmountCents: row.expectedAmountCents,
    expectedCurrency: row.expectedCurrency,
    providerTestMode: row.providerTestMode,
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
  createAttempt(data: CreatePaymentAttemptData): Promise<PaymentAttemptRecord> {
    return runQuery(async () => toRecord(await prisma.paymentAttempt.create({
      data: {
        orderId: data.orderId,
        provider: PROVIDER_TO_PRISMA[data.provider],
        expectedAmountCents: data.expectedAmountCents,
        expectedCurrency: data.expectedCurrency,
      },
    })));
  }

  bindProviderSession(data: BindPaymentAttemptData): Promise<PaymentAttemptRecord> {
    return runQuery(async () => {
      const result = await prisma.paymentAttempt.updateMany({
        where: {
          id: data.attemptId,
          environment: null,
          providerTransactionId: null,
        },
        data: {
          environment: ENVIRONMENT_TO_PRISMA[data.environment],
          providerTransactionId: data.providerTransactionId,
          checkoutUrl: data.checkoutUrl,
          expiresAt: data.expiresAt,
          providerTestMode: data.providerTestMode,
        },
      });

      const row = toRecord(await prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: data.attemptId },
      }));
      if (result.count === 1 || bindingMatches(row, data)) return row;
      throw new ConflictError('Payment attempt is already bound to a different provider session');
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
}

export const paymentAttemptRepository = new PaymentAttemptRepository();
