import { randomUUID } from 'node:crypto';
import {
  PaymentEnvironment as PrismaPaymentEnvironment,
  PaymentNotificationResolution as PrismaPaymentNotificationResolution,
  PaymentNotificationStatus as PrismaPaymentNotificationStatus,
  PaymentProvider as PrismaPaymentProvider,
  Prisma,
  type PaymentNotification as PrismaPaymentNotification,
} from '@prisma/client';
import type {
  PaymentNotificationErrorCode,
  PaymentNotificationResolution,
  PaymentNotificationStatus,
  StoredPaymentEvent,
} from 'server/domain/PaymentNotification';
import type { PaymentEnvironment, PaymentProvider } from 'server/domain/Payment';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';

export type PaymentNotificationRecord = StoredPaymentEvent & {
  id: string;
  paymentAttemptId: string | null;
  orderId: string | null;
  status: PaymentNotificationStatus;
  resolution: PaymentNotificationResolution | null;
  processingAttempts: number;
  availableAt: Date;
  claimToken: string | null;
  claimExpiresAt: Date | null;
  lastErrorCode: PaymentNotificationErrorCode | null;
  receivedAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type PaymentNotificationClaim = PaymentNotificationRecord & { claimToken: string };
export type PaymentNotificationListInput = { status?: PaymentNotificationStatus; cursor?: string; limit: number };
export type PaymentNotificationListResult = { items: PaymentNotificationRecord[]; nextCursor: string | null };

export interface IPaymentNotificationRepository {
  store(event: StoredPaymentEvent, now: Date): Promise<{ record: PaymentNotificationRecord; inserted: boolean }>;
  claimNext(now: Date, leaseMs: number, maxAttempts: number): Promise<PaymentNotificationClaim | null>;
  bind(claim: PaymentNotificationClaim, paymentAttemptId: string, orderId: string): Promise<boolean>;
  complete(claim: PaymentNotificationClaim, resolution: PaymentNotificationResolution, now: Date): Promise<boolean>;
  reject(claim: PaymentNotificationClaim, resolution: PaymentNotificationResolution, now: Date): Promise<boolean>;
  retry(claim: PaymentNotificationClaim, errorCode: PaymentNotificationErrorCode, now: Date, availableAt: Date, maxAttempts: number): Promise<'retry-wait' | 'exhausted' | 'claim-lost'>;
  list(input: PaymentNotificationListInput): Promise<PaymentNotificationListResult>;
  replay(notificationId: string, now: Date): Promise<PaymentNotificationRecord | null>;
}

const PROVIDER_TO_PRISMA: Record<PaymentProvider, PrismaPaymentProvider> = {
  mock: PrismaPaymentProvider.MOCK, cryptocloud: PrismaPaymentProvider.CRYPTOCLOUD, paddle: PrismaPaymentProvider.PADDLE,
};
const PROVIDER_FROM_PRISMA: Record<PrismaPaymentProvider, PaymentProvider> = {
  [PrismaPaymentProvider.MOCK]: 'mock', [PrismaPaymentProvider.CRYPTOCLOUD]: 'cryptocloud', [PrismaPaymentProvider.PADDLE]: 'paddle',
};
const ENV_FROM_PRISMA: Record<PrismaPaymentEnvironment, PaymentEnvironment> = {
  [PrismaPaymentEnvironment.TEST]: 'test', [PrismaPaymentEnvironment.SANDBOX]: 'sandbox', [PrismaPaymentEnvironment.PRODUCTION]: 'production',
};
const ENV_TO_PRISMA: Record<PaymentEnvironment, PrismaPaymentEnvironment> = {
  test: PrismaPaymentEnvironment.TEST, sandbox: PrismaPaymentEnvironment.SANDBOX,
  production: PrismaPaymentEnvironment.PRODUCTION,
};
const STATUS_TO_PRISMA: Record<PaymentNotificationStatus, PrismaPaymentNotificationStatus> = {
  received: PrismaPaymentNotificationStatus.RECEIVED, processing: PrismaPaymentNotificationStatus.PROCESSING,
  'retry-wait': PrismaPaymentNotificationStatus.RETRY_WAIT, completed: PrismaPaymentNotificationStatus.COMPLETED,
  rejected: PrismaPaymentNotificationStatus.REJECTED, exhausted: PrismaPaymentNotificationStatus.EXHAUSTED,
};
const STATUS_FROM_PRISMA: Record<PrismaPaymentNotificationStatus, PaymentNotificationStatus> = {
  [PrismaPaymentNotificationStatus.RECEIVED]: 'received', [PrismaPaymentNotificationStatus.PROCESSING]: 'processing',
  [PrismaPaymentNotificationStatus.RETRY_WAIT]: 'retry-wait', [PrismaPaymentNotificationStatus.COMPLETED]: 'completed',
  [PrismaPaymentNotificationStatus.REJECTED]: 'rejected', [PrismaPaymentNotificationStatus.EXHAUSTED]: 'exhausted',
};
const RESOLUTION_TO_PRISMA: Record<PaymentNotificationResolution, PrismaPaymentNotificationResolution> = {
  fulfilled: PrismaPaymentNotificationResolution.FULFILLED,
  'completed-duplicate': PrismaPaymentNotificationResolution.COMPLETED_DUPLICATE,
  ignored: PrismaPaymentNotificationResolution.IGNORED, 'unknown-order': PrismaPaymentNotificationResolution.UNKNOWN_ORDER,
  'order-not-pending': PrismaPaymentNotificationResolution.ORDER_NOT_PENDING,
  'mismatched-transaction': PrismaPaymentNotificationResolution.MISMATCHED_TRANSACTION,
  'rejected-receipt': PrismaPaymentNotificationResolution.REJECTED_RECEIPT,
  'fulfilled-with-exceptions': PrismaPaymentNotificationResolution.FULFILLED_WITH_EXCEPTIONS,
  'adjustment-recorded': PrismaPaymentNotificationResolution.ADJUSTMENT_RECORDED,
};
const RESOLUTION_FROM_PRISMA: Record<PrismaPaymentNotificationResolution, PaymentNotificationResolution> = {
  [PrismaPaymentNotificationResolution.FULFILLED]: 'fulfilled',
  [PrismaPaymentNotificationResolution.COMPLETED_DUPLICATE]: 'completed-duplicate',
  [PrismaPaymentNotificationResolution.IGNORED]: 'ignored', [PrismaPaymentNotificationResolution.UNKNOWN_ORDER]: 'unknown-order',
  [PrismaPaymentNotificationResolution.ORDER_NOT_PENDING]: 'order-not-pending',
  [PrismaPaymentNotificationResolution.MISMATCHED_TRANSACTION]: 'mismatched-transaction',
  [PrismaPaymentNotificationResolution.REJECTED_RECEIPT]: 'rejected-receipt',
  [PrismaPaymentNotificationResolution.FULFILLED_WITH_EXCEPTIONS]: 'fulfilled-with-exceptions',
  [PrismaPaymentNotificationResolution.ADJUSTMENT_RECORDED]: 'adjustment-recorded',
};

function toRecord(row: PrismaPaymentNotification): PaymentNotificationRecord {
  return {
    id: row.id, eventKey: row.eventKey,
    eventType: row.eventType === 'order.completed' ? 'order.completed'
      : row.eventType === 'payment.adjustment' ? 'payment.adjustment' : 'order.ignored',
    provider: PROVIDER_FROM_PRISMA[row.provider], sourceEventId: row.sourceEventId, occurredAt: row.occurredAt,
    environment: row.environment === null ? null : ENV_FROM_PRISMA[row.environment],
    providerTransactionId: row.providerTransactionId, correlationAttemptId: row.correlationAttemptId,
    providerTestMode: row.providerTestMode, paymentAttemptId: row.paymentAttemptId, orderId: row.orderId,
    status: STATUS_FROM_PRISMA[row.status], resolution: row.resolution === null ? null : RESOLUTION_FROM_PRISMA[row.resolution],
    processingAttempts: row.processingAttempts, availableAt: row.availableAt, claimToken: row.claimToken,
    claimExpiresAt: row.claimExpiresAt, lastErrorCode: errorCode(row.lastErrorCode), receivedAt: row.receivedAt,
    updatedAt: row.updatedAt, completedAt: row.completedAt,
    adjustmentProviderId: row.adjustmentProviderId, adjustmentAction: row.adjustmentAction,
    adjustmentStatus: row.adjustmentStatus, adjustmentAmountCents: row.adjustmentAmountCents,
    adjustmentCurrency: row.adjustmentCurrency, adjustmentUpdatedAt: row.adjustmentUpdatedAt,
  };
}

function errorCode(value: string | null): PaymentNotificationErrorCode | null {
  if (value === 'unknown-transaction' || value === 'provider-unreachable' || value === 'fulfillment-failed' || value === 'claim-lost' || value === 'adjustment-failed') return value;
  return null;
}

export class PaymentNotificationRepository implements IPaymentNotificationRepository {
  store(event: StoredPaymentEvent, now: Date): Promise<{ record: PaymentNotificationRecord; inserted: boolean }> {
    return runQuery(() => prisma.$transaction(async (db) => {
      const inserted = (await db.paymentNotification.createMany({
        data: [{ ...event, provider: PROVIDER_TO_PRISMA[event.provider],
          environment: event.environment === null ? null : ENV_TO_PRISMA[event.environment],
          status: PrismaPaymentNotificationStatus.RECEIVED,
          availableAt: now, receivedAt: now, updatedAt: now }], skipDuplicates: true,
      })).count === 1;
      const row = await db.paymentNotification.findUniqueOrThrow({ where: { eventKey: event.eventKey } });
      return { record: toRecord(row), inserted };
    }));
  }

  claimNext(now: Date, leaseMs: number, maxAttempts: number): Promise<PaymentNotificationClaim | null> {
    return runQuery(() => prisma.$transaction(async (db) => {
      await db.paymentNotification.updateMany({
        where: {
          status: PrismaPaymentNotificationStatus.PROCESSING,
          processingAttempts: { gte: maxAttempts },
          claimExpiresAt: { lte: now },
        },
        data: {
          status: PrismaPaymentNotificationStatus.EXHAUSTED,
          lastErrorCode: 'claim-lost',
          claimToken: null,
          claimExpiresAt: null,
          completedAt: now,
          updatedAt: now,
        },
      });
      const candidates = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "payment_notifications"
        WHERE "processing_attempts" < ${maxAttempts}
          AND (("status" = 'RECEIVED' AND "available_at" <= ${now})
            OR ("status" = 'RETRY_WAIT' AND "available_at" <= ${now})
            OR ("status" = 'PROCESSING' AND "claim_expires_at" <= ${now}))
        ORDER BY "available_at" ASC, "received_at" ASC
        LIMIT 1 FOR UPDATE SKIP LOCKED
      `);
      const candidate = candidates[0];
      if (candidate === undefined) return null;
      const claimToken = randomUUID();
      const row = await db.paymentNotification.update({ where: { id: candidate.id }, data: {
        status: PrismaPaymentNotificationStatus.PROCESSING, processingAttempts: { increment: 1 }, claimToken,
        claimExpiresAt: new Date(now.getTime() + leaseMs), updatedAt: now,
      } });
      return { ...toRecord(row), claimToken };
    }));
  }

  bind(claim: PaymentNotificationClaim, paymentAttemptId: string, orderId: string): Promise<boolean> {
    return this.claimUpdate(claim, { paymentAttemptId, orderId });
  }

  complete(claim: PaymentNotificationClaim, resolution: PaymentNotificationResolution, now: Date): Promise<boolean> {
    return this.claimUpdate(claim, { status: PrismaPaymentNotificationStatus.COMPLETED,
      resolution: RESOLUTION_TO_PRISMA[resolution], completedAt: now, claimToken: null, claimExpiresAt: null, updatedAt: now });
  }

  reject(claim: PaymentNotificationClaim, resolution: PaymentNotificationResolution, now: Date): Promise<boolean> {
    return this.claimUpdate(claim, { status: PrismaPaymentNotificationStatus.REJECTED,
      resolution: RESOLUTION_TO_PRISMA[resolution], completedAt: now, claimToken: null, claimExpiresAt: null, updatedAt: now });
  }

  async retry(claim: PaymentNotificationClaim, errorCodeValue: PaymentNotificationErrorCode, now: Date, availableAt: Date, maxAttempts: number): Promise<'retry-wait' | 'exhausted' | 'claim-lost'> {
    const exhausted = claim.processingAttempts >= maxAttempts;
    const updated = await this.claimUpdate(claim, {
      status: exhausted ? PrismaPaymentNotificationStatus.EXHAUSTED : PrismaPaymentNotificationStatus.RETRY_WAIT,
      lastErrorCode: errorCodeValue, availableAt, completedAt: exhausted ? now : null,
      claimToken: null, claimExpiresAt: null, updatedAt: now,
    });
    return updated ? (exhausted ? 'exhausted' : 'retry-wait') : 'claim-lost';
  }

  async list(input: PaymentNotificationListInput): Promise<PaymentNotificationListResult> {
    const limit = Math.max(1, Math.min(100, input.limit));
    const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
    const rows = await runQuery(() => prisma.paymentNotification.findMany({
      where: {
        ...(input.status === undefined ? {} : { status: STATUS_TO_PRISMA[input.status] }),
        ...(cursor === undefined ? {} : { OR: [
          { receivedAt: { lt: cursor.receivedAt } },
          { receivedAt: cursor.receivedAt, id: { lt: cursor.id } },
        ] }),
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    }));
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toRecord);
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last !== undefined ? encodeCursor(last.receivedAt, last.id) : null };
  }

  replay(notificationId: string, now: Date): Promise<PaymentNotificationRecord | null> {
    return runQuery(async () => {
      const result = await prisma.paymentNotification.updateMany({ where: { id: notificationId,
        status: { in: [PrismaPaymentNotificationStatus.REJECTED, PrismaPaymentNotificationStatus.EXHAUSTED] } }, data: {
        status: PrismaPaymentNotificationStatus.RECEIVED, resolution: null, processingAttempts: 0,
        availableAt: now, claimToken: null, claimExpiresAt: null, lastErrorCode: null, completedAt: null, updatedAt: now,
      } });
      if (result.count === 0) return null;
      return toRecord(await prisma.paymentNotification.findUniqueOrThrow({ where: { id: notificationId } }));
    });
  }

  private async claimUpdate(claim: PaymentNotificationClaim, data: Prisma.PaymentNotificationUncheckedUpdateManyInput): Promise<boolean> {
    const result = await runQuery(() => prisma.paymentNotification.updateMany({
      where: { id: claim.id, claimToken: claim.claimToken, status: PrismaPaymentNotificationStatus.PROCESSING }, data,
    }));
    return result.count === 1;
  }
}

function encodeCursor(receivedAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([receivedAt.toISOString(), id])).toString('base64url');
}

function decodeCursor(value: string): { receivedAt: Date; id: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') return undefined;
    const receivedAt = new Date(parsed[0]);
    return Number.isNaN(receivedAt.getTime()) ? undefined : { receivedAt, id: parsed[1] };
  } catch { return undefined; }
}

export const paymentNotificationRepository = new PaymentNotificationRepository();
