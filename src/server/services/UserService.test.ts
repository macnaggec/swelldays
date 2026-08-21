import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from 'server/services/UserService';
import type { IUserRepository } from 'server/repositories/UserRepository';
import type { LedgerService, LedgerSummary } from 'server/services/LedgerService';
import { BadRequestError } from 'server/errors';

const mockUserRepository = {
  anonymizeAndDelete: vi.fn(),
};

const mockLedgerService = {
  getSummary: vi.fn(),
};

const service = new UserService(
  mockUserRepository as unknown as IUserRepository,
  mockLedgerService as unknown as Pick<LedgerService, 'getSummary'>,
);

const summary = (overrides: Partial<LedgerSummary> = {}): LedgerSummary => ({
  availableBalanceCents: 0,
  pendingPayoutCents: 0,
  payoutThresholdCents: 2000,
  recentTransactions: [],
  payoutRequests: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserService.deleteAccount', () => {
  it('deletes the account when the platform owes nothing', async () => {
    mockLedgerService.getSummary.mockResolvedValue(summary());

    await service.deleteAccount('photographer-1');

    expect(mockUserRepository.anonymizeAndDelete).toHaveBeenCalledWith('photographer-1');
  });

  it('deletes the account when a balance remains, forfeiting it', async () => {
    mockLedgerService.getSummary.mockResolvedValue(
      summary({ availableBalanceCents: 4500 }),
    );

    await service.deleteAccount('photographer-1');

    expect(mockUserRepository.anonymizeAndDelete).toHaveBeenCalledWith('photographer-1');
  });

  it('refuses while a payout is in flight, so a rejected payout cannot refund a deleted account', async () => {
    mockLedgerService.getSummary.mockResolvedValue(
      summary({ pendingPayoutCents: 4500 }),
    );

    await expect(service.deleteAccount('photographer-1')).rejects.toBeInstanceOf(BadRequestError);
    expect(mockUserRepository.anonymizeAndDelete).not.toHaveBeenCalled();
  });
});
