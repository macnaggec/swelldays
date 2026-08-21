import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/repositories/mappers', () => ({
  mapToDraftMedia: (row: { id: string; thumbnailUrl?: string; lightboxUrl?: string }) => ({
    id: row.id,
    thumbnailUrl: row.thumbnailUrl,
    lightboxUrl: row.lightboxUrl,
  }),
}));

vi.mock('server/db', () => ({
  prisma: {
    mediaItem: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from 'server/db';
import { MediaRepository } from './MediaRepository';

const repo = new MediaRepository();
const mockFindMany = prisma.mediaItem.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.mediaItem.count as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MediaRepository.findDraftsBySpot', () => {
  it('queries only owned non-deleted drafts for the spot', async () => {
    mockFindMany.mockResolvedValue([]);

    await repo.findDraftsBySpot('spot-1', 'user-1');

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          spotId: 'spot-1',
          photographerId: 'user-1',
          status: 'DRAFT',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

describe('MediaRepository.hasDraftsByUser', () => {
  it('excludes draft media whose session has ever been published (currently being edited)', async () => {
    mockCount.mockResolvedValue(0);

    await repo.hasDraftsByUser('user-1');

    expect(mockCount).toHaveBeenCalledWith({
      where: {
        photographerId: 'user-1',
        status: 'DRAFT',
        deletedAt: null,
        session: { mediaItems: { none: { price: { not: null } } } },
      },
    });
  });

  it('returns true when a genuinely new, never-published draft exists', async () => {
    mockCount.mockResolvedValue(2);

    await expect(repo.hasDraftsByUser('user-1')).resolves.toBe(true);
  });

  it('returns false when there are no matching drafts', async () => {
    mockCount.mockResolvedValue(0);

    await expect(repo.hasDraftsByUser('user-1')).resolves.toBe(false);
  });
});
