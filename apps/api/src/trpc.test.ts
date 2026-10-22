import { describe, expect, it, vi } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = 'test-secret';
  process.env.CRYPTOCLOUD_API_KEY = 'test-api-key';
  process.env.CRYPTOCLOUD_SHOP_ID = 'test-shop-id';
});

import { BadRequestError, ConflictError, NotFoundError } from 'server/errors';
import { publicProcedure, router } from 'server/trpc';

// A resolver throwing a domain HttpError must reach the caller as a TRPCError whose
// code drives the correct HTTP status — not the default INTERNAL_SERVER_ERROR (500).
const testRouter = router({
  notFound: publicProcedure.query(() => { throw new NotFoundError('Widget'); }),
  badRequest: publicProcedure.query(() => { throw new BadRequestError('Bad input'); }),
  badRequestWithDetails: publicProcedure.query(() => {
    throw new BadRequestError('Bad input', { reason: 'own-media', mediaItemIds: ['media-1'] });
  }),
  conflict: publicProcedure.query(() => { throw new ConflictError('Already exists'); }),
  ok: publicProcedure.query(() => 'ok'),
});

const caller = testRouter.createCaller({ session: null, user: null });

describe('tRPC boundary: HttpError → TRPCError code mapping', () => {
  it('maps NotFoundError to NOT_FOUND (HTTP 404) with its message', async () => {
    await expect(caller.notFound()).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Widget not found' });
  });

  it('maps BadRequestError to BAD_REQUEST (HTTP 400)', async () => {
    await expect(caller.badRequest()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('serializes domain error details for typed clients', async () => {
    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req: new Request('http://localhost/trpc/badRequestWithDetails'),
      router: testRouter,
      createContext: () => Promise.resolve({ session: null, user: null }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        json: {
          message: 'Bad input',
          data: {
            code: 'BAD_REQUEST',
            details: { reason: 'own-media', mediaItemIds: ['media-1'] },
          },
        },
      },
    });
  });

  it('maps ConflictError to CONFLICT (HTTP 409)', async () => {
    await expect(caller.conflict()).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('passes successful calls through untouched', async () => {
    await expect(caller.ok()).resolves.toBe('ok');
  });
});
