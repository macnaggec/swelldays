import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from 'server/db';
import { ConflictError } from 'server/errors';
import { resetDb } from 'test/helpers/resetDb';
import { PaymentAttemptRepository } from './PaymentAttemptRepository';

const repository = new PaymentAttemptRepository();

beforeEach(resetDb);
afterEach(() => prisma.paymentAttempt.deleteMany());
afterAll(async () => {
  await prisma.paymentAttempt.deleteMany();
  await resetDb();
  await prisma.$disconnect();
});

async function createOrder(): Promise<string> {
  const order = await prisma.order.create({
    data: { clientRequestId: randomUUID(), totalAmount: 1000 },
  });
  return order.id;
}

describe('PaymentAttemptRepository provider identity uniqueness', () => {
  it('rejects binding the same provider/environment transaction to two attempts', async () => {
    const orderId = await createOrder();
    const first = await repository.createAttempt({
      orderId, provider: 'cryptocloud', expectedAmountCents: 1000, expectedCurrency: 'USD',
    });
    const second = await repository.createAttempt({
      orderId, provider: 'cryptocloud', expectedAmountCents: 1000, expectedCurrency: 'USD',
    });
    const binding = {
      environment: 'production' as const,
      providerTransactionId: 'INV-UNIQUE-1',
      checkoutUrl: 'https://pay.example/INV-UNIQUE-1',
      expiresAt: null,
      providerTestMode: false,
    };
    await repository.bindProviderSession({ attemptId: first.id, ...binding });
    await expect(repository.bindProviderSession({ attemptId: second.id, ...binding }))
      .rejects.toBeInstanceOf(ConflictError);
  });

  it('allows the same provider transaction id in different environments', async () => {
    const orderId = await createOrder();
    const sandbox = await repository.createAttempt({
      orderId, provider: 'paddle', expectedAmountCents: 1000, expectedCurrency: 'USD',
    });
    const production = await repository.createAttempt({
      orderId, provider: 'paddle', expectedAmountCents: 1000, expectedCurrency: 'USD',
    });
    await expect(repository.bindProviderSession({
      attemptId: sandbox.id, environment: 'sandbox', providerTransactionId: 'txn_shared',
      checkoutUrl: 'https://sandbox.example/txn_shared', expiresAt: null, providerTestMode: true,
    })).resolves.toEqual(expect.objectContaining({ environment: 'sandbox' }));
    await expect(repository.bindProviderSession({
      attemptId: production.id, environment: 'production', providerTransactionId: 'txn_shared',
      checkoutUrl: 'https://example/txn_shared', expiresAt: null, providerTestMode: false,
    })).resolves.toEqual(expect.objectContaining({ environment: 'production' }));
  });
});
