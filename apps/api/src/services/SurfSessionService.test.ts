import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SurfSessionService } from './SurfSessionService';
import type { ISurfSessionRepository } from 'server/repositories/SurfSessionRepository';
import { ForbiddenError, NotFoundError } from 'server/errors';

const sessions: Pick<ISurfSessionRepository, 'findPublishedById' | 'retire'> = {
  findPublishedById: vi.fn(),
  retire: vi.fn(),
};
const cleanup = { deleteStoredAsset: vi.fn().mockResolvedValue(undefined) };

const service = new SurfSessionService(sessions, cleanup);

beforeEach(() => vi.clearAllMocks());

describe('SurfSessionService.retire', () => {
  it('retires an owned published session', async () => {
    vi.mocked(sessions.findPublishedById).mockResolvedValue({
      id: 'session-1',
      photographerId: 'user-1',
    } as never);
    vi.mocked(sessions.retire).mockResolvedValue({ id: 'session-1', hardDeletedAssets: [] });

    await expect(service.retire('user-1', 'session-1')).resolves.toEqual({ id: 'session-1' });

    expect(sessions.retire).toHaveBeenCalledWith('session-1', 'user-1');
  });

  it('cleans up Cloudinary for every hard-deleted asset the repository reports', async () => {
    vi.mocked(sessions.findPublishedById).mockResolvedValue({
      id: 'session-1',
      photographerId: 'user-1',
    } as never);
    const assets = [
      { cloudinaryPublicId: 'swelldays/users/user-1/a', resourceType: 'PHOTO' as const },
      { cloudinaryPublicId: 'swelldays/users/user-1/b', resourceType: 'VIDEO' as const },
    ];
    vi.mocked(sessions.retire).mockResolvedValue({ id: 'session-1', hardDeletedAssets: assets });

    await service.retire('user-1', 'session-1');

    expect(cleanup.deleteStoredAsset).toHaveBeenCalledTimes(2);
    expect(cleanup.deleteStoredAsset).toHaveBeenCalledWith(assets[0]);
    expect(cleanup.deleteStoredAsset).toHaveBeenCalledWith(assets[1]);
  });

  it('rejects another photographer session', async () => {
    vi.mocked(sessions.findPublishedById).mockResolvedValue({
      id: 'session-1',
      photographerId: 'other-user',
    } as never);

    await expect(service.retire('user-1', 'session-1')).rejects.toThrow(ForbiddenError);

    expect(sessions.retire).not.toHaveBeenCalled();
  });

  it('rejects a missing session', async () => {
    vi.mocked(sessions.findPublishedById).mockResolvedValue(null);

    await expect(service.retire('user-1', 'missing-session')).rejects.toThrow(NotFoundError);

    expect(sessions.retire).not.toHaveBeenCalled();
  });
});
