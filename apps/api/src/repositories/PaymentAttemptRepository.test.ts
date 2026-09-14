import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentAttemptCreationState, PaymentEnvironment, PaymentProvider } from '@prisma/client';

vi.mock('server/db', () => ({
  prisma: {
    paymentAttempt: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from 'server/db';
import { ConflictError } from 'server/errors';
import { PaymentAttemptRepository } from './PaymentAttemptRepository';

const repository = new PaymentAttemptRepository();
const row = {
  id: 'attempt-1', orderId: 'order-1', provider: PaymentProvider.CRYPTOCLOUD,
  creationState: PaymentAttemptCreationState.READY, creationFailureCode: null,
  environment: PaymentEnvironment.PRODUCTION, providerTransactionId: 'INV-1',
  checkoutUrl: 'https://pay.example/INV-1', expiresAt: null,
  expectedAmountCents: 1500, expectedCurrency: 'USD', providerTestMode: false,
  createdAt: new Date('2026-09-07T16:00:00Z'), updatedAt: new Date('2026-09-07T16:00:00Z'),
};

beforeEach(() => vi.clearAllMocks());

describe('PaymentAttemptRepository', () => {
  it('maps lowercase domain provider values explicitly when creating', async () => {
    vi.mocked(prisma.paymentAttempt.create).mockResolvedValue({
      ...row, creationState: PaymentAttemptCreationState.CREATING,
      environment: null, providerTransactionId: null, checkoutUrl: null, providerTestMode: null,
    });
    await repository.prepareAttempt({
      orderId: 'order-1', provider: 'cryptocloud', expectedAmountCents: 1500, expectedCurrency: 'USD',
    });
    expect(prisma.paymentAttempt.create).toHaveBeenCalledWith({ data: {
      orderId: 'order-1', provider: PaymentProvider.CRYPTOCLOUD,
      creationState: PaymentAttemptCreationState.CREATING,
      expectedAmountCents: 1500, expectedCurrency: 'USD',
    } });
  });

  it('normalizes a legacy CREATING row with a complete binding to ready', async () => {
    vi.mocked(prisma.paymentAttempt.findUnique).mockResolvedValue({
      ...row, creationState: PaymentAttemptCreationState.CREATING,
    });
    await expect(repository.findById('attempt-1')).resolves.toEqual(
      expect.objectContaining({ creationState: 'ready' }),
    );
  });

  it('preserves a bound row when an unknown transition loses a race', async () => {
    vi.mocked(prisma.paymentAttempt.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.paymentAttempt.findUniqueOrThrow).mockResolvedValue(row);
    await expect(repository.markCreationUnknown('attempt-1', 'provider-timeout')).resolves.toEqual(
      expect.objectContaining({ creationState: 'ready', providerTransactionId: 'INV-1' }),
    );
  });

  it('marks ready attempts failed without clearing provider facts', async () => {
    vi.mocked(prisma.paymentAttempt.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.paymentAttempt.findUniqueOrThrow).mockResolvedValue({
      ...row,
      creationState: PaymentAttemptCreationState.DEFINITIVELY_FAILED,
      creationFailureCode: 'authoritative-expiry',
    });
    await repository.markCreationFailed('attempt-1', 'authoritative-expiry');
    expect(prisma.paymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        creationState: PaymentAttemptCreationState.DEFINITIVELY_FAILED,
        creationFailureCode: 'authoritative-expiry',
      },
    }));
  });

  it('finds one attempt oldest-first and refuses to guess between two', async () => {
    vi.mocked(prisma.paymentAttempt.findMany).mockResolvedValue([row]);
    await expect(repository.findByOrderId('order-1')).resolves.toEqual(expect.objectContaining({ id: 'attempt-1' }));
    expect(prisma.paymentAttempt.findMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' }, orderBy: { createdAt: 'asc' }, take: 2,
    });
    vi.mocked(prisma.paymentAttempt.findMany).mockResolvedValue([row, { ...row, id: 'attempt-2' }]);
    await expect(repository.findByOrderId('order-1')).rejects.toBeInstanceOf(ConflictError);
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
