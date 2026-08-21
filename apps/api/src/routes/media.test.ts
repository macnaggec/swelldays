import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
});

const mocks = vi.hoisted(() => ({ getFavoriteIds: vi.fn(), getFavorites: vi.fn(), setFavorite: vi.fn() }));
vi.mock('server/services/MediaFavoriteService', () => ({ mediaFavoriteService: mocks }));
vi.mock('server/services/MediaService', () => ({ mediaService: {} }));

import { mediaRouter } from './media';

describe('media favorites routes', () => {
  it('requires authentication', async () => {
    const caller = mediaRouter.createCaller({ session: null, user: null });
    await expect(caller.favoriteIds()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('sets the authenticated user favorite explicitly', async () => {
    const mediaItemId = '11111111-1111-4111-8111-111111111111';
    mocks.setFavorite.mockResolvedValue({ favorited: true });
    const caller = mediaRouter.createCaller({ session: {} as never, user: { id: 'user-1' } as never });

    await expect(caller.setFavorite({ mediaItemId, favorited: true })).resolves.toEqual({ favorited: true });
    expect(mocks.setFavorite).toHaveBeenCalledWith('user-1', mediaItemId, true);
  });
});
