import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
});

const mocks = vi.hoisted(() => ({
  retire: vi.fn(),
  listPublished: vi.fn(),
}));

vi.mock('server/services/SurfSessionService', () => ({
  surfSessionService: {
    retire: mocks.retire,
  },
}));

vi.mock('server/repositories/SurfSessionRepository', () => ({
  surfSessionRepository: {
    listPublished: mocks.listPublished,
    findByPhotographer: vi.fn(),
    findPublishedById: vi.fn(),
  },
}));

vi.mock('server/services/MediaService', () => ({
  mediaService: { findPublishedBySession: vi.fn() },
}));

import { sessionsRouter } from './sessions';

describe('sessionsRouter.list favorites filter', () => {
  it('derives the favorite owner from the authenticated viewer', async () => {
    mocks.listPublished.mockResolvedValue({ items: [], nextCursor: null });
    const caller = sessionsRouter.createCaller({
      session: {} as never,
      user: { id: 'user-1' } as never,
    });

    await caller.list({ limit: 20, favoritesOnly: true });

    expect(mocks.listPublished).toHaveBeenCalledWith({
      spotId: undefined,
      cursor: undefined,
      limit: 20,
      dateFrom: undefined,
      dateTo: undefined,
      favoriteUserId: 'user-1',
    });
  });

  it('rejects favorite-only filtering without an authenticated viewer', async () => {
    const caller = sessionsRouter.createCaller({ session: null, user: null });

    await expect(caller.list({ limit: 20, favoritesOnly: true })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });
});

describe('sessionsRouter.retire', () => {
  it('delegates to the session service with the authenticated photographer', async () => {
    mocks.retire.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    const caller = sessionsRouter.createCaller({
      session: {} as never,
      user: { id: 'user-1' } as never,
    });

    await expect(caller.retire('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      id: '11111111-1111-4111-8111-111111111111',
    });

    expect(mocks.retire).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111');
  });
});
