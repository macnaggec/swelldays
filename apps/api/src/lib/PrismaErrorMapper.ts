import { Prisma } from '@prisma/client';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  InternalServerError,
} from 'server/errors';

export function mapPrismaError(error: unknown): Error {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return error as Error;
  }

  const { code, meta } = error;

  switch (code) {
    // Unique constraint violation (e.g., duplicate email)
    case 'P2002': {
      const fields = (meta?.target as string[]) || [];
      return new ConflictError(
        `${fields.join(', ')} already exists`,
        { fields }
      );
    }

    // Record not found
    case 'P2025':
      return new NotFoundError('Record', { meta });

    // Foreign key constraint violation
    case 'P2003':
      return new BadRequestError(
        'Invalid reference to related record',
        { meta }
      );

    // Required field missing
    case 'P2011':
      return new BadRequestError(
        'Required field is missing',
        { meta }
      );

    // Value too long for column
    case 'P2000':
      return new BadRequestError(
        'Value is too long',
        { meta }
      );

    // Invalid data type
    case 'P2007':
    case 'P2008':
      return new BadRequestError(
        'Invalid data type provided',
        { meta }
      );

    // Database connection error
    case 'P1001':
    case 'P1002':
      return new InternalServerError(
        'Database connection failed',
        { code, meta }
      );

    // Query timeout
    case 'P2024':
      return new InternalServerError(
        'Database query timeout',
        { meta }
      );

    // Default: treat as internal error (don't expose internals)
    default:
      return new InternalServerError(
        'Database operation failed',
        { code, meta }
      );
  }
}

export async function runQuery<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[db] query failed', err);
    throw mapPrismaError(err);
  }
}
