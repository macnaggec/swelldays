import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PayoutStatus,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { LedgerService } from 'server/services/LedgerService';
import type { ILedgerRepository } from 'server/repositories/LedgerRepository';

const mockLedgerRepository = {
  getSummaryRecords: vi.fn(),
  reservePayout: vi.fn(),
};

const service = new LedgerService(
  mockLedgerRepository as unknown as ILedgerRepository,
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LedgerService.getSummary', () => {
  it('returns a photographer-specific ledger summary from existing ledger records', async () => {
    const firstSaleAt = new Date('2026-07-05T09:00:00.000Z');
    const secondSaleAt = new Date('2026-07-05T10:00:00.000Z');
    const firstRequestAt = new Date('2026-07-05T11:00:00.000Z');
    const secondRequestAt = new Date('2026-07-05T12:00:00.000Z');
    const completedRequestAt = new Date('2026-07-05T13:00:00.000Z');

    mockLedgerRepository.getSummaryRecords.mockResolvedValue({
      user: { id: 'photographer-1', balance: 4500 },
      recentTransactions: [
        {
          id: 'tx-new',
          userId: 'photographer-1',
          amount: 2200,
          type: TransactionType.SALE,
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'order-new',
          createdAt: secondSaleAt,
        },
        {
          id: 'tx-old',
          userId: 'photographer-1',
          amount: 1800,
          type: TransactionType.SALE,
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'order-old',
          createdAt: firstSaleAt,
        },
      ],
      payoutRequests: [
        {
          id: 'payout-processing',
          photographerId: 'photographer-1',
          amount: 1500,
          status: PayoutStatus.PROCESSING,
          externalTransferId: null,
          note: null,
          requestedAt: secondRequestAt,
          processedAt: null,
        },
        {
          id: 'payout-pending',
          photographerId: 'photographer-1',
          amount: 700,
          status: PayoutStatus.PENDING,
          externalTransferId: null,
          note: null,
          requestedAt: firstRequestAt,
          processedAt: null,
        },
        {
          id: 'payout-completed',
          photographerId: 'photographer-1',
          amount: 900,
          status: PayoutStatus.COMPLETED,
          externalTransferId: 'wise-1',
          note: null,
          requestedAt: completedRequestAt,
          processedAt: completedRequestAt,
        },
      ],
    });

    const summary = await service.getSummary('photographer-1');

    expect(mockLedgerRepository.getSummaryRecords).toHaveBeenCalledWith('photographer-1');
    expect(summary).toEqual({
      availableBalanceCents: 4500,
      pendingPayoutCents: 2200,
      payoutThresholdCents: 2000,
      recentTransactions: [
        {
          id: 'tx-new',
          amount: 2200,
          type: TransactionType.SALE,
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'order-new',
          createdAt: secondSaleAt,
        },
        {
          id: 'tx-old',
          amount: 1800,
          type: TransactionType.SALE,
          status: TransactionStatus.COMPLETED,
          externalOrderId: 'order-old',
          createdAt: firstSaleAt,
        },
      ],
      payoutRequests: [
        {
          id: 'payout-processing',
          amount: 1500,
          status: PayoutStatus.PROCESSING,
          externalTransferId: null,
          note: null,
          requestedAt: secondRequestAt,
          processedAt: null,
        },
        {
          id: 'payout-pending',
          amount: 700,
          status: PayoutStatus.PENDING,
          externalTransferId: null,
          note: null,
          requestedAt: firstRequestAt,
          processedAt: null,
        },
        {
          id: 'payout-completed',
          amount: 900,
          status: PayoutStatus.COMPLETED,
          externalTransferId: 'wise-1',
          note: null,
          requestedAt: completedRequestAt,
          processedAt: completedRequestAt,
        },
      ],
    });
  });
});

describe('LedgerService.requestPayout', () => {
  it('reserves the full available balance and returns a refreshed summary', async () => {
    const requestedAt = new Date('2026-07-05T12:00:00.000Z');

    mockLedgerRepository.getSummaryRecords
      .mockResolvedValueOnce({
        user: { id: 'photographer-1', balance: 4500 },
        recentTransactions: [],
        payoutRequests: [],
      })
      .mockResolvedValueOnce({
        user: { id: 'photographer-1', balance: 0 },
        recentTransactions: [
          {
            id: 'tx-payout',
            userId: 'photographer-1',
            amount: -4500,
            type: TransactionType.PAYOUT,
            status: TransactionStatus.PENDING,
            externalOrderId: null,
            createdAt: requestedAt,
          },
        ],
        payoutRequests: [
          {
            id: 'payout-1',
            photographerId: 'photographer-1',
            transactionId: 'tx-payout',
            amount: 4500,
            status: PayoutStatus.PENDING,
            externalTransferId: null,
            note: null,
            requestedAt,
            processedAt: null,
          },
        ],
      });
    mockLedgerRepository.reservePayout.mockResolvedValue({
      payoutRequest: { id: 'payout-1' },
      transaction: { id: 'tx-payout' },
    });

    const summary = await service.requestPayout('photographer-1');

    expect(mockLedgerRepository.reservePayout).toHaveBeenCalledWith({
      photographerId: 'photographer-1',
      amountCents: 4500,
    });
    expect(summary.availableBalanceCents).toBe(0);
    expect(summary.pendingPayoutCents).toBe(4500);
  });

  it('rejects payout requests below the threshold without reserving balance', async () => {
    mockLedgerRepository.getSummaryRecords.mockResolvedValue({
      user: { id: 'photographer-1', balance: 1999 },
      recentTransactions: [],
      payoutRequests: [],
    });

    await expect(service.requestPayout('photographer-1')).rejects.toThrow(
      'Minimum payout is $20.00',
    );

    expect(mockLedgerRepository.reservePayout).not.toHaveBeenCalled();
  });
});
