import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    mediaItem: {
      updateMany: vi.fn(),
    },
    surfSession: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from 'server/db';
import { SurfSessionRepository } from './SurfSessionRepository';
import { BadRequestError } from 'server/errors';

const repo = new SurfSessionRepository();
const mockTransaction = prisma.$transaction as ReturnType<typeof vi.fn>;
const mockSessionFindMany = prisma.surfSession.findMany as ReturnType<typeof vi.fn>;
const mockSessionFindFirst = prisma.surfSession.findFirst as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SurfSessionRepository.findByPhotographer', () => {
  it('returns only complete published session projections', async () => {
    mockSessionFindMany.mockResolvedValue([
      {
        id: 'session-1',
        spotId: 'spot-1',
        photographerId: 'user-1',
        startsAt: new Date('2026-01-01T06:00:00Z'),
        endsAt: new Date('2026-01-01T08:00:00Z'),
        status: 'PUBLISHED',
        createdAt: new Date('2026-01-01T05:00:00Z'),
        spot: { id: 'spot-1', name: 'Pipeline', location: 'North Shore' },
        photographer: { id: 'user-1', name: 'Kai' },
        mediaItems: [{ thumbnailUrl: 'thumb.jpg' }],
        _count: { mediaItems: 1 },
      },
      {
        id: 'incomplete-session',
        spotId: null,
        photographerId: 'user-1',
        startsAt: null,
        endsAt: null,
        status: 'PUBLISHED',
        createdAt: new Date('2026-01-01T05:00:00Z'),
        spot: null,
        photographer: { id: 'user-1', name: 'Kai' },
        mediaItems: [],
        _count: { mediaItems: 0 },
      },
    ]);

    const result = await repo.findByPhotographer('user-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'session-1', mediaCount: 1, thumbnailUrl: 'thumb.jpg' });
    expect(mockSessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { photographerId: 'user-1', status: 'PUBLISHED' },
    }));
  });
});

describe('SurfSessionRepository.findPublishedById', () => {
  it('returns null when the stored session is incomplete', async () => {
    mockSessionFindFirst.mockResolvedValue({
      id: 'session-1',
      spotId: null,
      photographerId: 'user-1',
      startsAt: null,
      endsAt: null,
      status: 'PUBLISHED',
      createdAt: new Date('2026-01-01T05:00:00Z'),
      spot: null,
      photographer: { id: 'user-1', name: 'Kai' },
      mediaItems: [],
      _count: { mediaItems: 0 },
    });

    await expect(repo.findPublishedById('session-1')).resolves.toBeNull();
  });
});

describe('SurfSessionRepository.retire', () => {
  it('hard-deletes never-purchased media and soft-deletes purchased media', async () => {
    const tx = {
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'unpurchased-media',
            cloudinaryPublicId: 'swelldays/users/user-1/unpurchased',
            type: 'PHOTO',
            purchases: [],
          },
          {
            id: 'purchased-media',
            cloudinaryPublicId: 'swelldays/users/user-1/purchased',
            type: 'VIDEO',
            purchases: [{ id: 'purchase-1' }],
          },
        ]),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      surfSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.retire('session-1', 'user-1')).resolves.toEqual({
      id: 'session-1',
      hardDeletedAssets: [{ cloudinaryPublicId: 'swelldays/users/user-1/unpurchased', resourceType: 'PHOTO' }],
    });

    expect(tx.mediaItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['unpurchased-media'] } },
    });
    expect(tx.mediaItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['purchased-media'] } },
      data: { status: 'DELETED', deletedAt: expect.any(Date) },
    });
    expect(tx.surfSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'session-1', photographerId: 'user-1', status: 'PUBLISHED' },
      data: { status: 'DELETED' },
    });
  });

  it('throws when the target session is not a removable published session', async () => {
    const tx = {
      mediaItem: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
      },
      surfSession: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockTransaction.mockImplementation((fn: any) => fn(tx));

    await expect(repo.retire('session-1', 'user-1')).rejects.toThrow(BadRequestError);
  });
});

describe('public discovery query', () => {
  it('requires real published media and a complete session, and orders ties deterministically', async () => {
    mockSessionFindMany.mockResolvedValue([]);
    await repo.listPublished({ limit: 20 });
    expect(mockSessionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: 'PUBLISHED',
        spotId: { not: null }, startsAt: { not: null }, endsAt: { not: null },
        mediaItems: { some: { status: 'PUBLISHED', deletedAt: null } },
      }),
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
    }));
  });
});
