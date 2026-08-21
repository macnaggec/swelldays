import { describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from 'server/errors';
import { MediaFavoriteService } from './MediaFavoriteService';

describe('MediaFavoriteService.setFavorite', () => {
  const media = { findById: vi.fn() };
  const favorites = { add: vi.fn(), remove: vi.fn(), findIdsByUser: vi.fn(), findByUser: vi.fn() };
  const service = new MediaFavoriteService(media, favorites);

  it('rejects favoriting missing media', async () => {
    media.findById.mockResolvedValue(null);

    await expect(service.setFavorite('user-1', 'media-1', true)).rejects.toThrow(NotFoundError);
    expect(favorites.add).not.toHaveBeenCalled();
  });

  it('rejects favoriting unpublished media', async () => {
    media.findById.mockResolvedValue({ id: 'media-1', status: 'DRAFT', deletedAt: null });

    await expect(service.setFavorite('user-1', 'media-1', true)).rejects.toThrow(BadRequestError);
    expect(favorites.add).not.toHaveBeenCalled();
  });

  it('removes idempotently without requiring the media to remain published', async () => {
    favorites.remove.mockResolvedValue(undefined);

    await expect(service.setFavorite('user-1', 'media-1', false)).resolves.toEqual({ favorited: false });
    expect(favorites.remove).toHaveBeenCalledWith('user-1', 'media-1');
  });
});
