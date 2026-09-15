import { beforeEach, describe, it, expect, vi } from 'vitest';
import { Prisma, UserRole } from '@prisma/client';
import { BadRequestError, ConflictError } from 'server/errors';
import { prisma } from 'server/db';
import {
  SERIALIZATION_NAMESPACE,
  buyerScope,
  accountScope,
  orderScope,
  fulfillmentScope,
  acquireSerializationLock,
  acquireActiveAccountLock,
  acquireActiveAccountLocks,
  isTransientTransactionConflict,
  TRANSACTION_RETRY_ATTEMPTS,
  withTransactionRetry,
} from './TransactionSerialization';

function makeP2034(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Transaction failed due to a write conflict or a deadlock', {
    code: 'P2034',
    clientVersion: 'test',
  });
}

function accountRecord(deletedAt: Date | null) {
  const now = new Date();
  return {
    id: 'account-1',
    name: null,
    email: 'account@example.com',
    password: null,
    role: UserRole.USER,
    balance: 0,
    createdAt: now,
    emailVerified: false,
    image: null,
    updatedAt: now,
    deletedAt,
    externalCustomerId: null,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('buyerScope / orderScope / fulfillmentScope', () => {
  it('accountScope scopes to the account namespace with the account id as key', () => {
    expect(accountScope('account-1')).toEqual({ namespace: SERIALIZATION_NAMESPACE.account, key: 'account-1' });
  });
  it('buyerScope scopes to the buyer namespace with the buyerId as key', () => {
    expect(buyerScope('buyer-1')).toEqual({ namespace: SERIALIZATION_NAMESPACE.buyer, key: 'buyer-1' });
  });

  it('orderScope scopes to the order namespace with the orderId as key', () => {
    expect(orderScope('order-1')).toEqual({ namespace: SERIALIZATION_NAMESPACE.order, key: 'order-1' });
  });

  it('fulfillmentScope picks the buyer scope when a buyerId is present', () => {
    expect(fulfillmentScope('buyer-1', 'order-1')).toEqual(buyerScope('buyer-1'));
  });

  it('fulfillmentScope falls back to the order scope for a guest order (buyerId null)', () => {
    expect(fulfillmentScope(null, 'order-1')).toEqual(orderScope('order-1'));
  });
});

describe('active account serialization', () => {
  it('locks before confirming the account is active', async () => {
    const executeRaw = vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
    const findUnique = vi.mocked(prisma.user.findUnique).mockResolvedValue(accountRecord(null));

    await acquireActiveAccountLock(prisma, 'account-1');

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'account-1' }, select: { deletedAt: true } });
  });

  it('rejects a closed account after acquiring its lock', async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(accountRecord(new Date()));

    await expect(acquireActiveAccountLock(prisma, 'account-1')).rejects.toThrow('Account is closed');
  });

  it('rejects a missing account after acquiring its lock', async () => {
    vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(acquireActiveAccountLock(prisma, 'account-1')).rejects.toThrow('User not found');
  });

  it('deduplicates and lexicographically sorts account locks', async () => {
    const executeRaw = vi.mocked(prisma.$executeRaw).mockResolvedValue(0);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(accountRecord(null));

    await acquireActiveAccountLocks(prisma, ['seller-b', 'seller-a', 'seller-b']);

    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(executeRaw.mock.calls.map((call) => call.slice(1))).toEqual([
      [SERIALIZATION_NAMESPACE.account, 'seller-a'],
      [SERIALIZATION_NAMESPACE.account, 'seller-b'],
    ]);
  });
});

describe('acquireSerializationLock', () => {
  it('passes the namespace and key as parameterized values to pg_advisory_xact_lock', async () => {
    const executeRaw = vi.fn().mockResolvedValue(undefined);
    const tx = { $executeRaw: executeRaw };

    await acquireSerializationLock(tx, buyerScope('buyer-42'));

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join('');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('hashtext');
    expect(values).toEqual([SERIALIZATION_NAMESPACE.buyer, 'buyer-42']);
  });
});

describe('isTransientTransactionConflict', () => {
  it('is true for a Prisma P2034 write conflict / deadlock error', () => {
    expect(isTransientTransactionConflict(makeP2034())).toBe(true);
  });

  it('is false for a BadRequestError', () => {
    expect(isTransientTransactionConflict(new BadRequestError('bad'))).toBe(false);
  });

  it('is false for a ConflictError', () => {
    expect(isTransientTransactionConflict(new ConflictError('conflict'))).toBe(false);
  });

  it('is false for a plain Error', () => {
    expect(isTransientTransactionConflict(new Error('boom'))).toBe(false);
  });
});

describe('withTransactionRetry', () => {
  it('returns immediately on success', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(withTransactionRetry(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries a P2034 conflict up to TRANSACTION_RETRY_ATTEMPTS times, then rethrows', async () => {
    const operation = vi.fn().mockRejectedValue(makeP2034());

    await expect(withTransactionRetry(operation)).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    expect(operation).toHaveBeenCalledTimes(TRANSACTION_RETRY_ATTEMPTS);
  });

  it('succeeds after a transient conflict resolves within the retry budget', async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(makeP2034())
      .mockResolvedValueOnce('recovered');

    await expect(withTransactionRetry(operation)).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry a BadRequestError — the operation runs exactly once', async () => {
    const operation = vi.fn().mockRejectedValue(new BadRequestError('bad'));

    await expect(withTransactionRetry(operation)).rejects.toThrow(BadRequestError);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
