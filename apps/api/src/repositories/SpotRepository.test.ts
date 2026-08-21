import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server/repositories/mappers', () => ({
  mapToMediaItem: (row: { id: string }) => ({
    id: row.id,
    thumbnailUrl: `https://test.cloudinary.com/${row.id}/thumb`,
    lightboxUrl: `https://test.cloudinary.com/${row.id}/lbw`,
  }),
}));

vi.mock('server/db', () => ({
  prisma: {
    mediaItem: {
      findMany: vi.fn(),
    },
    spot: {
      findMany: vi.fn(),
    },
    userFavoriteSpot: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from 'server/db';
import { SpotRepository } from './SpotRepository';

const repo = new SpotRepository();
const mockSpotFindMany = prisma.spot.findMany as ReturnType<typeof vi.fn>;
const mockFavoriteFindUnique = prisma.userFavoriteSpot.findUnique as ReturnType<typeof vi.fn>;
const mockFavoriteCreate = prisma.userFavoriteSpot.create as ReturnType<typeof vi.fn>;
const mockFavoriteDelete = prisma.userFavoriteSpot.delete as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('SpotRepository.findSpotsByBounds', () => {
  function makePrismaSpot(overrides: { id?: string; lat?: string; lng?: string } = {}) {
    return {
      id: overrides.id ?? 'spot-1',
      name: 'Test Spot',
      location: 'Bali, Indonesia',
      lat: overrides.lat ?? '10.0',
      lng: overrides.lng ?? '115.0',
      status: 'verified',
      creatorId: null,
      createdAt: new Date('2024-01-01'),
      aliases: [],
      coverUrl: null,
      searchRadius: null,
    };
  }

  it('returns mapped spots within the given bounds', async () => {
    const rows = [makePrismaSpot({ id: 'spot-1' }), makePrismaSpot({ id: 'spot-2' })];
    mockSpotFindMany.mockResolvedValue(rows);

    const result = await repo.findSpotsByBounds(-10, 100, 20, 130);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('spot-1');
    expect(result[1]!.id).toBe('spot-2');
  });

  it('passes the correct bounds filter to prisma', async () => {
    mockSpotFindMany.mockResolvedValue([]);

    await repo.findSpotsByBounds(-10, 100, 20, 130);

    expect(mockSpotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { lat: { not: null } },
            { lng: { not: null } },
            { lat: { gte: -10, lte: 20 } },
            { lng: { gte: 100, lte: 130 } },
          ],
        },
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('returns empty array when no spots fall within bounds', async () => {
    mockSpotFindMany.mockResolvedValue([]);

    const result = await repo.findSpotsByBounds(0, 0, 1, 1);

    expect(result).toEqual([]);
  });

  it('maps coords to Position with lat/lng as numbers', async () => {
    mockSpotFindMany.mockResolvedValue([makePrismaSpot({ lat: '-8.815', lng: '115.085' })]);

    const result = await repo.findSpotsByBounds(-90, -180, 90, 180);

    expect(result[0]!.coords).toEqual({ lat: -8.815, lng: 115.085 });
  });
});

describe('SpotRepository.toggleSpotFavorite', () => {
  it('creates a favorite row when none exists', async () => {
    mockFavoriteFindUnique.mockResolvedValue(null);

    const result = await repo.toggleSpotFavorite('spot-1', 'user-1');

    expect(result).toBe(true);
    expect(mockFavoriteCreate).toHaveBeenCalledWith({
      data: { userId: 'user-1', spotId: 'spot-1' },
    });
    expect(mockFavoriteDelete).not.toHaveBeenCalled();
  });

  it('deletes the favorite row when one already exists', async () => {
    mockFavoriteFindUnique.mockResolvedValue({ userId: 'user-1', spotId: 'spot-1' });

    const result = await repo.toggleSpotFavorite('spot-1', 'user-1');

    expect(result).toBe(false);
    expect(mockFavoriteDelete).toHaveBeenCalledWith({
      where: { userId_spotId: { userId: 'user-1', spotId: 'spot-1' } },
    });
    expect(mockFavoriteCreate).not.toHaveBeenCalled();
  });
});

describe('SpotRepository.isSpotFavorited', () => {
  it('returns true when a favorite row exists', async () => {
    mockFavoriteFindUnique.mockResolvedValue({ userId: 'user-1', spotId: 'spot-1' });

    await expect(repo.isSpotFavorited('spot-1', 'user-1')).resolves.toBe(true);
  });

  it('returns false when no favorite row exists', async () => {
    mockFavoriteFindUnique.mockResolvedValue(null);

    await expect(repo.isSpotFavorited('spot-1', 'user-1')).resolves.toBe(false);
  });
});
