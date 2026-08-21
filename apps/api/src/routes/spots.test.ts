import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
});

const mocks = vi.hoisted(() => ({
  findPublishedBySpot: vi.fn(),
  findPublishedDates: vi.fn(),
}));

vi.mock('server/services/MediaService', () => ({
  mediaService: {
    findPublishedBySpot: mocks.findPublishedBySpot,
    findPublishedDates: mocks.findPublishedDates,
  },
}));
vi.mock('server/repositories/SpotRepository', () => ({ spotRepository: {} }));
vi.mock('server/repositories/MediaRepository', () => ({ mediaRepository: {} }));

import { spotsRouter } from './spots';

describe('spotsRouter.mediaFeed browse filters', () => {
  it('derives the favorite owner from the authenticated viewer', async () => {
    mocks.findPublishedBySpot.mockResolvedValue({ items: [], nextCursor: null });
    const caller = spotsRouter.createCaller({ session: {} as never, user: { id: 'viewer-1' } as never });
    const dateFrom = new Date('2026-07-10T00:00:00Z');
    const dateTo = new Date('2026-07-11T00:00:00Z');

    await caller.mediaFeed({ limit: 30, sortOrder: 'desc', dateFrom, dateTo, favoriteSpotsOnly: true });

    expect(mocks.findPublishedBySpot).toHaveBeenCalledWith({
      spotId: undefined,
      cursor: undefined,
      limit: 30,
      sortOrder: 'desc',
      dateFrom,
      dateTo,
      favoriteUserId: 'viewer-1',
    }, 'viewer-1');
  });

  it('rejects favorite-only gallery filtering without an authenticated viewer', async () => {
    const caller = spotsRouter.createCaller({ session: null, user: null });

    await expect(caller.mediaFeed({ limit: 30, sortOrder: 'desc', favoriteSpotsOnly: true }))
      .rejects.toBeInstanceOf(TRPCError);
  });
});

describe('spotsRouter.mediaDateIndex browse filters', () => {
  it('uses the same authenticated browse scope without pagination', async () => {
    mocks.findPublishedDates.mockResolvedValue([]);
    const caller = spotsRouter.createCaller({ session: {} as never, user: { id: 'viewer-1' } as never });
    const dateFrom = new Date('2026-07-10T00:00:00Z');
    const dateTo = new Date('2026-07-11T00:00:00Z');

    await caller.mediaDateIndex({ spotId: 'spot-1', dateFrom, dateTo, favoriteSpotsOnly: true });

    expect(mocks.findPublishedDates).toHaveBeenCalledWith({
      spotId: 'spot-1',
      sortOrder: 'desc',
      dateFrom,
      dateTo,
      favoriteUserId: 'viewer-1',
    });
  });

  it('rejects favorite-only date indexing without an authenticated viewer', async () => {
    const caller = spotsRouter.createCaller({ session: null, user: null });

    await expect(caller.mediaDateIndex({ favoriteSpotsOnly: true }))
      .rejects.toBeInstanceOf(TRPCError);
  });
});
