import { Prisma } from '@prisma/client';

/**
 * Advisory-lock namespaces. Two-argument pg_advisory_xact_lock keeps buyer and
 * order keys in separate spaces, so a hashtext collision between an unrelated
 * buyer id and order id cannot make them block each other.
 */
export const SERIALIZATION_NAMESPACE = {
  buyer: 1,
  order: 2,
} as const;

export type SerializationNamespace =
  (typeof SERIALIZATION_NAMESPACE)[keyof typeof SERIALIZATION_NAMESPACE];

export type SerializationScope = {
  namespace: SerializationNamespace;
  key: string;
};

export function buyerScope(buyerId: string): SerializationScope {
  return { namespace: SERIALIZATION_NAMESPACE.buyer, key: buyerId };
}

export function orderScope(orderId: string): SerializationScope {
  return { namespace: SERIALIZATION_NAMESPACE.order, key: orderId };
}

/** Buyer-scoped when the order has a buyer; order-scoped for a guest order. */
export function fulfillmentScope(buyerId: string | null, orderId: string): SerializationScope {
  return buyerId !== null ? buyerScope(buyerId) : orderScope(orderId);
}

export async function acquireSerializationLock(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  scope: SerializationScope,
): Promise<void> {
  // The ::int4 cast is required — Prisma sends a JS number in a form Postgres
  // will not otherwise match to the (int4, int4) overload. Keep the cast.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${scope.namespace}::int4, hashtext(${scope.key}))`;
}

/**
 * True only for a PostgreSQL write conflict or deadlock that is safe to
 * retry. Broadening this set beyond P2034 is how a business rejection
 * (BadRequestError, ConflictError, ...) silently becomes an infinite retry
 * instead of surfacing to the caller.
 */
export function isTransientTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export const TRANSACTION_RETRY_ATTEMPTS = 3;

export async function withTransactionRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < TRANSACTION_RETRY_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (!isTransientTransactionConflict(err)) throw err;
    }
  }

  throw lastError;
}
