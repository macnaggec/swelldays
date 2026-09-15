import {
  PaymentAdjustmentAction as DbAction, PaymentAdjustmentProviderStatus as DbStatus,
  PaymentAdjustmentResolution,
  PaymentProvider, PaymentEnvironment,
  Prisma,
} from '@prisma/client';
import { prisma } from 'server/db';
import { BadRequestError, NotFoundError } from 'server/errors';
import type { ApplyPaymentAdjustmentCommand, NormalizedPaymentAdjustment, RecordManualPaymentAdjustmentCommand } from 'server/domain/PaymentAdjustment';
import { sellerReversalAmount } from 'server/domain/PaymentAdjustment';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { acquireActiveAccountLocks } from 'server/lib/TransactionSerialization';
import { ledgerRepository } from 'server/repositories/LedgerRepository';

const ACTION: Record<NormalizedPaymentAdjustment['action'], DbAction> = {
  refund: DbAction.REFUND, credit: DbAction.CREDIT, dispute: DbAction.DISPUTE,
  'dispute-reversal': DbAction.DISPUTE_REVERSAL, warning: DbAction.WARNING,
  'warning-reversal': DbAction.WARNING_REVERSAL, 'credit-reversal': DbAction.CREDIT_REVERSAL,
};
const STATUS: Record<NormalizedPaymentAdjustment['status'], DbStatus> = {
  'pending-approval': DbStatus.PENDING_APPROVAL, approved: DbStatus.APPROVED,
  rejected: DbStatus.REJECTED, reversed: DbStatus.REVERSED,
};
const PROVIDER: Record<NormalizedPaymentAdjustment['identity']['provider'], PaymentProvider> = {
  mock: PaymentProvider.MOCK, cryptocloud: PaymentProvider.CRYPTOCLOUD, paddle: PaymentProvider.PADDLE,
};
const ENVIRONMENT: Record<NormalizedPaymentAdjustment['identity']['environment'], PaymentEnvironment> = {
  test: PaymentEnvironment.TEST, sandbox: PaymentEnvironment.SANDBOX, production: PaymentEnvironment.PRODUCTION,
};

export class PaymentAdjustmentRepository {
  async recordManual(command: RecordManualPaymentAdjustmentCommand) {
    const attempt = await runQuery(() => prisma.paymentAttempt.findUnique({ where: { id: command.paymentAttemptId },
      select: { provider: true, environment: true, providerTransactionId: true, expectedCurrency: true } }));
    if (attempt?.environment === null || attempt?.environment === undefined || attempt.providerTransactionId === null) {
      throw new BadRequestError('Payment attempt has no durable provider identity');
    }
    if (attempt.expectedCurrency !== command.currency) throw new BadRequestError('Adjustment currency does not match payment attempt');
    const provider = attempt.provider === PaymentProvider.MOCK ? 'mock'
      : attempt.provider === PaymentProvider.CRYPTOCLOUD ? 'cryptocloud' : 'paddle';
    const environment = attempt.environment === PaymentEnvironment.TEST ? 'test'
      : attempt.environment === PaymentEnvironment.SANDBOX ? 'sandbox' : 'production';
    const recorded = await this.record({ providerAdjustmentId: command.providerAdjustmentId,
      identity: { provider, environment, providerTransactionId: attempt.providerTransactionId },
      action: command.action, status: command.status, amountCents: command.amountCents,
      currency: command.currency, occurredAt: command.occurredAt, updatedAt: command.updatedAt }, command.paymentAttemptId,
    { operatorId: command.operatorId, note: command.note });
    return recorded;
  }

  record(
    normalized: NormalizedPaymentAdjustment,
    paymentAttemptId: string,
    audit?: { operatorId: string; note: string },
  ) {
    return runQuery(() => prisma.$transaction(async (tx) => {
      const identityKey = `${normalized.identity.provider}:${normalized.identity.environment}:${normalized.providerAdjustmentId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identityKey}))`;
      const attempt = await tx.paymentAttempt.findUnique({ where: { id: paymentAttemptId },
        select: { provider: true, environment: true, providerTransactionId: true, expectedCurrency: true } });
      if (attempt === null || attempt.provider !== PROVIDER[normalized.identity.provider]
        || attempt.environment !== ENVIRONMENT[normalized.identity.environment]
        || attempt.providerTransactionId !== normalized.identity.providerTransactionId
        || attempt.expectedCurrency !== normalized.currency) {
        throw new BadRequestError('Adjustment does not match payment attempt identity');
      }
      const where = { provider_environment_providerAdjustmentId: {
        provider: PROVIDER[normalized.identity.provider],
        environment: ENVIRONMENT[normalized.identity.environment],
        providerAdjustmentId: normalized.providerAdjustmentId,
      } };
      const existing = await tx.paymentAdjustment.findUnique({ where });
      if (existing !== null && existing.paymentAttemptId !== paymentAttemptId) {
        throw new BadRequestError('Adjustment identity belongs to another payment attempt');
      }
      if (existing !== null && existing.providerUpdatedAt >= normalized.updatedAt) return existing;
      if (existing !== null && existing.resolution === PaymentAdjustmentResolution.APPLIED
        && (existing.action !== ACTION[normalized.action] || existing.amountCents !== normalized.amountCents
          || existing.currency !== normalized.currency)) {
        throw new BadRequestError('Applied adjustment economics cannot change');
      }
      const data = { paymentAttemptId, action: ACTION[normalized.action], providerStatus: STATUS[normalized.status],
        amountCents: normalized.amountCents, currency: normalized.currency, occurredAt: normalized.occurredAt,
        providerUpdatedAt: normalized.updatedAt,
        ...(audit === undefined ? {} : { operatorId: audit.operatorId, operatorNote: audit.note }) };
      return existing === null
        ? tx.paymentAdjustment.create({ data: { ...data, provider: where.provider_environment_providerAdjustmentId.provider,
          environment: where.provider_environment_providerAdjustmentId.environment,
          providerAdjustmentId: normalized.providerAdjustmentId } })
        : tx.paymentAdjustment.update({ where, data });
    }));
  }

  listPending(limit: number, cursor?: string) {
    const take = Math.max(1, Math.min(100, limit));
    return runQuery(() => Promise.all([
      prisma.paymentAdjustment.findMany({ where: { resolution: PaymentAdjustmentResolution.PENDING_REVIEW },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
        include: { paymentAttempt: { include: { order: { include: { items: true } }, paidOrderLines: { include: { allocations: true } } } } } }),
      prisma.paidOrderLine.findMany({ where: { deliveryStatus: 'COMPENSATION_REQUIRED', resolvedAt: null },
        orderBy: { createdAt: 'desc' }, take, include: { paymentAttempt: true, allocations: true } }),
    ]).then(([adjustments, compensationLines]) => ({ adjustments, compensationLines,
      nextCursor: adjustments.length === take ? adjustments.at(-1)!.id : null })));
  }

  apply(command: ApplyPaymentAdjustmentCommand) {
    return runQuery(() => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payment_adjustments" WHERE "id" = ${command.adjustmentId} FOR UPDATE`;
      const adjustment = await tx.paymentAdjustment.findUnique({ where: { id: command.adjustmentId },
        include: { allocations: true } });
      if (adjustment === null) throw new NotFoundError('PaymentAdjustment');
      if (adjustment.resolution !== PaymentAdjustmentResolution.PENDING_REVIEW
        || adjustment.providerStatus !== DbStatus.APPROVED) throw new BadRequestError('Adjustment is not eligible');
      if (adjustment.action === DbAction.DISPUTE_REVERSAL || adjustment.action === DbAction.CREDIT_REVERSAL) {
        return this.applyReversal(tx, adjustment, command);
      }
      if (adjustment.action !== DbAction.REFUND && adjustment.action !== DbAction.DISPUTE) {
        throw new BadRequestError('Adjustment is not eligible');
      }
      if (command.allocations.length === 0 || new Set(command.allocations.map((a) => a.paidOrderLineId)).size !== command.allocations.length
        || command.allocations.some((a) => !Number.isSafeInteger(a.amountCents) || a.amountCents <= 0)
        || command.allocations.reduce((sum, a) => sum + a.amountCents, 0) !== adjustment.amountCents) {
        throw new BadRequestError('Invalid adjustment allocations');
      }
      const paidLineIds = command.allocations.map((allocation) => allocation.paidOrderLineId).sort();
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "paid_order_lines"
        WHERE "id" IN (${Prisma.join(paidLineIds)}) ORDER BY "id" FOR UPDATE`);
      const lines = await tx.paidOrderLine.findMany({ where: { id: { in: command.allocations.map((a) => a.paidOrderLineId) } },
        include: { allocations: { include: { paymentAdjustment: true } } } });
      if (lines.length !== command.allocations.length || lines.some((line) => line.paymentAttemptId !== adjustment.paymentAttemptId
        || line.currency !== adjustment.currency)) throw new BadRequestError('Adjustment allocation does not match payment');
      await acquireActiveAccountLocks(tx, lines.map((line) => line.sellerId));
      for (const allocation of command.allocations.sort((a, b) => a.paidOrderLineId.localeCompare(b.paidOrderLineId))) {
        const line = lines.find((candidate) => candidate.id === allocation.paidOrderLineId)!;
        const prior = line.allocations.filter((item) => item.paymentAdjustment.resolution === PaymentAdjustmentResolution.APPLIED);
        const alreadyAdjusted = prior.reduce((sum, item) => sum + (
          item.paymentAdjustment.action === DbAction.DISPUTE_REVERSAL || item.paymentAdjustment.action === DbAction.CREDIT_REVERSAL
            ? -item.amountCents : item.amountCents), 0);
        if (alreadyAdjusted + allocation.amountCents > line.amountPaid) throw new BadRequestError('Adjustment exceeds paid line');
        const alreadyDebited = -prior.reduce((sum, item) => sum + item.sellerLedgerAmount, 0);
        const sellerLedgerAmount = line.deliveryStatus === 'COMPENSATION_REQUIRED' ? 0 : sellerReversalAmount({
          originalAmountPaid: line.amountPaid, originalSellerEarnings: line.sellerEarnings,
          cumulativeAdjustedCustomerAmount: alreadyAdjusted + allocation.amountCents, alreadyDebitedSellerAmount: alreadyDebited,
        });
        const created = await tx.paymentAdjustmentAllocation.create({ data: {
          paymentAdjustmentId: adjustment.id, paidOrderLineId: line.id,
          amountCents: allocation.amountCents, sellerLedgerAmount,
        } });
        if (sellerLedgerAmount !== 0) {
          await ledgerRepository.recordAdjustment(tx, {
            photographerId: line.sellerId,
            amount: sellerLedgerAmount,
            paymentAdjustmentAllocationId: created.id,
          });
        }
      }
      const resolved = await tx.paymentAdjustment.update({ where: { id: adjustment.id }, data: {
        resolution: PaymentAdjustmentResolution.APPLIED, operatorId: command.operatorId,
        operatorNote: command.note, resolvedAt: new Date(),
      } });
      if (command.revokeEntitlements) await this.revokeFullyAdjustedEntitlements(tx, lines);
      return resolved;
    }));
  }

  dismiss(adjustmentId: string, note: string, operatorId: string) {
    return runQuery(() => prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "payment_adjustments" WHERE "id" = ${adjustmentId} FOR UPDATE`;
      const adjustment = await tx.paymentAdjustment.findUnique({ where: { id: adjustmentId } });
      if (adjustment === null) throw new NotFoundError('PaymentAdjustment');
      const dismissible = adjustment.providerStatus === DbStatus.REJECTED || adjustment.providerStatus === DbStatus.REVERSED
        || adjustment.action === DbAction.WARNING || adjustment.action === DbAction.WARNING_REVERSAL || adjustment.action === DbAction.CREDIT;
      if (!dismissible || adjustment.resolution !== PaymentAdjustmentResolution.PENDING_REVIEW) throw new BadRequestError('Adjustment is not dismissible');
      const changed = await tx.paymentAdjustment.updateMany({ where: { id: adjustmentId,
        resolution: PaymentAdjustmentResolution.PENDING_REVIEW }, data: { resolution: PaymentAdjustmentResolution.DISMISSED,
        operatorId, operatorNote: note, resolvedAt: new Date() } });
      if (changed.count !== 1) throw new BadRequestError('Adjustment is not dismissible');
      return tx.paymentAdjustment.findUniqueOrThrow({ where: { id: adjustmentId } });
    }));
  }

  resolveCompensation(paidOrderLineId: string, adjustmentId: string, note: string, operatorId: string) {
    return runQuery(() => prisma.$transaction(async (tx) => {
      const line = await tx.paidOrderLine.findUnique({ where: { id: paidOrderLineId }, include: { allocations: { include: { paymentAdjustment: true } } } });
      if (line === null) throw new NotFoundError('PaidOrderLine');
      const refunded = line.allocations.filter((a) => a.paymentAdjustment.id === adjustmentId
        && a.paymentAdjustment.action === DbAction.REFUND && a.paymentAdjustment.resolution === PaymentAdjustmentResolution.APPLIED)
        .reduce((sum, a) => sum + a.amountCents, 0);
      if (line.deliveryStatus !== 'COMPENSATION_REQUIRED' || refunded < line.amountPaid) throw new BadRequestError('Compensation is not fully refunded');
      return tx.paidOrderLine.update({ where: { id: paidOrderLineId }, data: { resolvedAt: new Date(),
        exceptionReason: `${note.trim()} (resolved by ${operatorId})` } });
    }));
  }

  private async applyReversal(tx: Prisma.TransactionClient, adjustment: {
    id: string; paymentAttemptId: string; currency: string; amountCents: number; action: DbAction;
  }, command: ApplyPaymentAdjustmentCommand) {
    const sourceId = command.reversesAdjustmentId;
    if (sourceId === undefined) throw new BadRequestError('Reversal source is required');
    const source = await tx.paymentAdjustment.findUnique({ where: { id: sourceId },
      include: { allocations: true, reversedByAdjustment: { select: { id: true } } } });
    const reversalMatchesSource = adjustment.action === DbAction.DISPUTE_REVERSAL
      ? source?.action === DbAction.DISPUTE
      : adjustment.action === DbAction.CREDIT_REVERSAL && source?.action === DbAction.CREDIT;
    if (source === null || source.resolution !== PaymentAdjustmentResolution.APPLIED
      || source.paymentAttemptId !== adjustment.paymentAttemptId || source.currency !== adjustment.currency
      || source.reversedByAdjustment !== null || source.amountCents !== adjustment.amountCents
      || !reversalMatchesSource) throw new BadRequestError('Invalid reversal source');
    const sourceLineIds = source.allocations.map((allocation) => allocation.paidOrderLineId).sort();
    if (sourceLineIds.length === 0) throw new BadRequestError('Reversal source has no allocations');
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "paid_order_lines"
      WHERE "id" IN (${Prisma.join(sourceLineIds)}) ORDER BY "id" FOR UPDATE`);
    const sourceLines = await tx.paidOrderLine.findMany({ where: { id: { in: sourceLineIds } } });
    await acquireActiveAccountLocks(tx, sourceLines.map((line) => line.sellerId));
    const requested = [...command.allocations].sort((a, b) => a.paidOrderLineId.localeCompare(b.paidOrderLineId));
    const original = [...source.allocations].sort((a, b) => a.paidOrderLineId.localeCompare(b.paidOrderLineId));
    if (requested.length !== original.length || requested.some((item, index) => {
      const sourceItem = original[index];
      return sourceItem === undefined || item.paidOrderLineId !== sourceItem.paidOrderLineId
        || item.amountCents !== sourceItem.amountCents;
    })) throw new BadRequestError('Reversal allocations must exactly match the source');
    for (const item of source.allocations) {
      const created = await tx.paymentAdjustmentAllocation.create({ data: { paymentAdjustmentId: adjustment.id,
        paidOrderLineId: item.paidOrderLineId, amountCents: item.amountCents, sellerLedgerAmount: -item.sellerLedgerAmount } });
      if (item.sellerLedgerAmount !== 0) {
        const line = sourceLines.find((candidate) => candidate.id === item.paidOrderLineId)!;
        await ledgerRepository.recordAdjustment(tx, {
          photographerId: line.sellerId,
          amount: -item.sellerLedgerAmount,
          paymentAdjustmentAllocationId: created.id,
        });
      }
    }
    return tx.paymentAdjustment.update({ where: { id: adjustment.id }, data: { resolution: PaymentAdjustmentResolution.APPLIED,
      reversesAdjustmentId: source.id, operatorId: command.operatorId, operatorNote: command.note, resolvedAt: new Date() } });
  }

  private async revokeFullyAdjustedEntitlements(tx: Prisma.TransactionClient, lines: Array<{ buyerId: string | null; mediaItemId: string }>) {
    for (const key of new Map(lines.map((line) => [`${line.buyerId}:${line.mediaItemId}`, line])).values()) {
      if (key.buyerId === null) throw new BadRequestError('Guest entitlement requires manual review');
      const all = await tx.paidOrderLine.findMany({ where: { buyerId: key.buyerId, mediaItemId: key.mediaItemId },
        include: { allocations: { include: { paymentAdjustment: true } } } });
      const remaining = all.reduce((sum, line) => sum + line.amountPaid - line.allocations
        .filter((a) => a.paymentAdjustment.resolution === PaymentAdjustmentResolution.APPLIED)
        .reduce((allocated, a) => allocated + (
          a.paymentAdjustment.action === DbAction.DISPUTE_REVERSAL || a.paymentAdjustment.action === DbAction.CREDIT_REVERSAL
            ? -a.amountCents : a.amountCents), 0), 0);
      if (remaining !== 0) throw new BadRequestError('Funded paid line still supports entitlement');
      await tx.purchase.updateMany({ where: { buyerId: key.buyerId, mediaItemId: key.mediaItemId, revokedAt: null },
        data: { revokedAt: new Date() } });
    }
  }
}

export const paymentAdjustmentRepository = new PaymentAdjustmentRepository();
