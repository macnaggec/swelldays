import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from 'server/db';
import { PaymentAdjustmentRepository } from './PaymentAdjustmentRepository';

const repository = new PaymentAdjustmentRepository();
const normalized = {
  providerAdjustmentId: 'adj-1',
  identity: { provider: 'paddle' as const, environment: 'sandbox' as const, providerTransactionId: 'txn-1' },
  action: 'refund' as const,
  status: 'approved' as const,
  amountCents: 500,
  currency: 'USD',
  occurredAt: new Date('2026-09-15T00:00:00Z'),
  updatedAt: new Date('2026-09-15T01:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('PaymentAdjustmentRepository identity boundary', () => {
  it('rejects a provider adjustment before persistence when the stored attempt identity differs', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      paymentAttempt: { findUnique: vi.fn().mockResolvedValue({
        provider: 'PADDLE', environment: 'SANDBOX', providerTransactionId: 'txn-other', expectedCurrency: 'USD',
      }) },
      paymentAdjustment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    };
    vi.mocked(prisma.$transaction).mockImplementation((operation) => Reflect.apply(operation, undefined, [tx]));

    await expect(repository.record(normalized, 'attempt-1')).rejects.toThrow(
      'Adjustment does not match payment attempt identity',
    );
    expect(tx.paymentAdjustment.findUnique).not.toHaveBeenCalled();
    expect(tx.paymentAdjustment.create).not.toHaveBeenCalled();
  });
});
