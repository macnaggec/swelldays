import { describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { BadRequestError, ConflictError } from 'server/errors';
import {
  SERIALIZATION_NAMESPACE,
  buyerScope,
  orderScope,
  fulfillmentScope,
  acquireSerializationLock,
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

describe('buyerScope / orderScope / fulfillmentScope', () => {
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
