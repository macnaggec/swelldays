import { initTRPC, TRPCError } from '@trpc/server';
import { UserRole } from '@prisma/client';
import type { Context } from 'hono';
import superjson from 'superjson';
import { auth } from 'server/auth';
import { prisma } from 'server/db';
import { isHttpError } from 'server/errors';
import { logger } from 'server/lib/logger';

type GetSessionResult = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
type ContextUser = GetSessionResult['user'] & { role?: UserRole };

export type TRPCContext = {
  session: GetSessionResult['session'] | null;
  user: ContextUser | null;
};

export async function createContext(c: Context): Promise<TRPCContext> {
  const session = await auth.api
    .getSession({ headers: c.req.raw.headers })
    .catch((err) => {
      logger.warn('[trpc] auth session retrieval failed', { err });
      return null;
    });

  const authUser = session?.user ?? null;
  const dbUser = authUser
    ? await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true },
    }).catch((err) => {
      logger.warn('[trpc] user role retrieval failed', { err });
      return null;
    })
    : null;

  return {
    session: session?.session ?? null,
    user: authUser ? { ...authUser, role: dbUser?.role } : null,
  };
}

const STATUS_TO_CODE: Record<number, TRPCError['code']> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
};

/** Single source of truth for turning an HttpError's statusCode into a tRPC error code. */
function httpStatusToTRPCCode(statusCode: number): TRPCError['code'] {
  return STATUS_TO_CODE[statusCode] ??
    (statusCode < 500 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR');
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;
    if (isHttpError(cause)) {
      return { ...shape, message: cause.message, data: { ...shape.data, code: httpStatusToTRPCCode(cause.statusCode) } };
    }
    return shape;
  },
});

/**
 * Translate service-layer HttpErrors into TRPCErrors with the right code.
 *
 * Resolvers throw domain HttpErrors (NotFoundError, BadRequestError, …). tRPC wraps
 * any non-TRPCError throw as INTERNAL_SERVER_ERROR, and the HTTP status is derived
 * from that code *before* errorFormatter shapes the body — so without this an expected
 * 404/400/409 ships as HTTP 500. Runs outermost so it covers every inner middleware
 * and the resolver. TRPCErrors thrown directly (auth) have no HttpError cause and pass through.
 */
const mapHttpErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && isHttpError(result.error.cause)) {
    const cause = result.error.cause;
    throw new TRPCError({
      code: httpStatusToTRPCCode(cause.statusCode),
      message: cause.message,
      cause,
    });
  }
  return result;
});

const baseProcedure = t.procedure.use(mapHttpErrors);

export const router = t.router;
export const publicProcedure = baseProcedure;
export const protectedProcedure = baseProcedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== UserRole.ADMIN) throw new TRPCError({ code: 'FORBIDDEN' });
  return next({ ctx });
});
