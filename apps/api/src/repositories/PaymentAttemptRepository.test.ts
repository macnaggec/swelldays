import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentEnvironment, PaymentProvider } from '@prisma/client';

vi.mock('server/db', () => ({
  prisma: {
    paymentAttempt: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from 'server/db';
import { ConflictError } from 'server/errors';
import { PaymentAttemptRepository } from './PaymentAttemptRepository';

const repository = new PaymentAttemptRepository();
const row = {
  id: 'attempt-1', orderId: 'order-1', provider: PaymentProvider.CRYPTOCLOUD,
  environment: PaymentEnvironment.PRODUCTION, providerTransactionId: 'INV-1',
  checkoutUrl: 'https://pay.example/INV-1', expiresAt: null,
  expectedAmountCents: 1500, expectedCurrency: 'USD', providerTestMode: false,
  createdAt: new Date('2026-09-07T16:00:00Z'), updatedAt: new Date('2026-09-07T16:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('PaymentAttemptRepository', () => {
  it('maps lowercase domain provider values explicitly when creating', async () => {
    vi.mocked(prisma.paymentAttempt.create).mockResolvedValue({
      ...row, environment: null, providerTransactionId: null, checkoutUrl: null, providerTestMode: null,
    });
    await repository.createAttempt({
      orderId: 'order-1', provider: 'cryptocloud', expectedAmountCents: 1500, expectedCurrency: 'USD',
    });
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith({ data: {
      orderId: 'order-1', provider: PaymentProvider.CRYPTOCLOUD,
      expectedAmountCents: 1500, expectedCurrency: 'USD',
    } });
  });

  it('binds only an unbound row with an atomic conditional update', async () => {
    vi.mocked(prisma.paymentAttempt.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.paymentAttempt.findUniqueOrThrow).mockResolvedValue(row);
    await expect(repository.bindProviderSession({
      attemptId: 'attempt-1', environment: 'production', providerTransactionId: 'INV-1',
      checkoutUrl: 'https://pay.example/INV-1', expiresAt: null, providerTestMode: false,
    })).resolves.toEqual(expect.objectContaining({ provider: 'cryptocloud', environment: 'production' }));
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'attempt-1', environment: null, providerTransactionId: null },
    }));
  });

  it('returns an identical rebind idempotently and rejects different binding fields', async () => {
    vi.mocked(prisma.paymentAttempt.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.paymentAttempt.findUniqueOrThrow).mockResolvedValue(row);
    const identical = {
      attemptId: 'attempt-1', environment: 'production' as const, providerTransactionId: 'INV-1',
      checkoutUrl: 'https://pay.example/INV-1', expiresAt: null, providerTestMode: false,
    };
    await expect(repository.bindProviderSession(identical)).resolves.toEqual(expect.objectContaining({ id: 'attempt-1' }));
    await expect(repository.bindProviderSession({ ...identical, providerTransactionId: 'INV-2' }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('looks up the unique provider/environment/transaction tuple', async () => {
    vi.mocked(prisma.paymentAttempt.findUnique).mockResolvedValue(row);
    await repository.findByIdentity({
      provider: 'cryptocloud', environment: 'production', providerTransactionId: 'INV-1',
    });
    expect(prisma.paymentAttempt.findUnique).toHaveBeenCalledWith({ where: {
      provider_environment_providerTransactionId: {
        provider: PaymentProvider.CRYPTOCLOUD,
        environment: PaymentEnvironment.PRODUCTION,
        providerTransactionId: 'INV-1',
      },
    } });
  });
});
