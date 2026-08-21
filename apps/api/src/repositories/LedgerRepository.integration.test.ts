import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PayoutStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { prisma } from 'server/db';
import { resetDb } from 'test/helpers/resetDb';
import { LedgerRepository } from './LedgerRepository';

const repo = new LedgerRepository();

beforeEach(resetDb);
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function createReservedPayout() {
  const photographer = await prisma.user.create({
    data: { email: `ledger-${randomUUID()}@example.com`, balance: 4500 },
  });
  const reservation = await repo.reservePayout({
    photographerId: photographer.id,
    amountCents: 4500,
  });

  return { photographer, reservation };
}

describe('LedgerRepository.reservePayout', () => {
  it('atomically reserves available balance and links the payout request to its ledger transaction', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'ledger-reserve@example.com', balance: 4500 },
    });

    const reservation = await repo.reservePayout({
      photographerId: photographer.id,
      amountCents: 4500,
    });

    const [user, payoutRequests, transactions] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: photographer.id } }),
      prisma.payoutRequest.findMany({ where: { photographerId: photographer.id } }),
      prisma.transaction.findMany({ where: { userId: photographer.id } }),
    ]);

    expect(user.balance).toBe(0);
    expect(payoutRequests).toHaveLength(1);
    expect(transactions).toHaveLength(1);
    expect(payoutRequests[0]).toMatchObject({
      id: reservation.payoutRequest.id,
      photographerId: photographer.id,
      amount: 4500,
      status: PayoutStatus.PENDING,
      transactionId: transactions[0]!.id,
    });
    expect(transactions[0]).toMatchObject({
      id: reservation.transaction.id,
      userId: photographer.id,
      amount: -4500,
      type: TransactionType.PAYOUT,
      status: TransactionStatus.PENDING,
    });
  });

  it('does not reserve the same available balance twice', async () => {
    const photographer = await prisma.user.create({
      data: { email: 'ledger-double-reserve@example.com', balance: 4500 },
    });

    await repo.reservePayout({
      photographerId: photographer.id,
      amountCents: 4500,
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(repo.reservePayout({
      photographerId: photographer.id,
      amountCents: 4500,
    })).rejects.toThrow('Insufficient available balance');
    consoleError.mockRestore();

    const [user, payoutRequestCount, transactionCount] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: photographer.id } }),
      prisma.payoutRequest.count({ where: { photographerId: photographer.id } }),
      prisma.transaction.count({ where: { userId: photographer.id } }),
    ]);

    expect(user.balance).toBe(0);
    expect(payoutRequestCount).toBe(1);
    expect(transactionCount).toBe(1);
  });
});

describe('LedgerRepository payout lifecycle', () => {
  it('marks a pending payout request as processing', async () => {
    const { reservation } = await createReservedPayout();

    const result = await repo.markPayoutProcessing(reservation.payoutRequest.id);

    expect(result.payoutRequest.status).toBe(PayoutStatus.PROCESSING);
    expect(result.transaction.status).toBe(TransactionStatus.PENDING);
  });

  it('completes a processing payout without changing balance', async () => {
    const { photographer, reservation } = await createReservedPayout();
    await repo.markPayoutProcessing(reservation.payoutRequest.id);

    const result = await repo.completePayout(
      reservation.payoutRequest.id,
      'manual-transfer-1',
    );

    const [user, payoutRequest, transaction] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: photographer.id } }),
      prisma.payoutRequest.findUniqueOrThrow({ where: { id: reservation.payoutRequest.id } }),
      prisma.transaction.findUniqueOrThrow({ where: { id: reservation.transaction.id } }),
    ]);

    expect(user.balance).toBe(0);
    expect(payoutRequest.status).toBe(PayoutStatus.COMPLETED);
    expect(payoutRequest.externalTransferId).toBe('manual-transfer-1');
    expect(payoutRequest.processedAt).toBeInstanceOf(Date);
    expect(transaction.status).toBe(TransactionStatus.COMPLETED);
    expect(result.payoutRequest.status).toBe(PayoutStatus.COMPLETED);
    expect(result.transaction.status).toBe(TransactionStatus.COMPLETED);
  });

  it('rejects a payout request by restoring balance and failing the linked transaction', async () => {
    const { photographer, reservation } = await createReservedPayout();

    const result = await repo.rejectPayout(
      reservation.payoutRequest.id,
      'Bank details need review',
    );

    const [user, payoutRequest, transaction] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: photographer.id } }),
      prisma.payoutRequest.findUniqueOrThrow({ where: { id: reservation.payoutRequest.id } }),
      prisma.transaction.findUniqueOrThrow({ where: { id: reservation.transaction.id } }),
    ]);

    expect(user.balance).toBe(4500);
    expect(payoutRequest.status).toBe(PayoutStatus.REJECTED);
    expect(payoutRequest.note).toBe('Bank details need review');
    expect(payoutRequest.processedAt).toBeInstanceOf(Date);
    expect(transaction.status).toBe(TransactionStatus.FAILED);
    expect(result.payoutRequest.status).toBe(PayoutStatus.REJECTED);
    expect(result.transaction.status).toBe(TransactionStatus.FAILED);
  });

  it('does not restore balance twice when a rejection is retried', async () => {
    const { photographer, reservation } = await createReservedPayout();
    await repo.rejectPayout(reservation.payoutRequest.id, 'Bank details need review');

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(repo.rejectPayout(
      reservation.payoutRequest.id,
      'Second attempt',
    )).rejects.toThrow('Payout request cannot be rejected');
    consoleError.mockRestore();

    const user = await prisma.user.findUniqueOrThrow({ where: { id: photographer.id } });
    expect(user.balance).toBe(4500);
  });
});
