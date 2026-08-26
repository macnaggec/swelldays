import { Spot as PrismaSpot } from '@prisma/client';
import type { MediaType } from '@swelldays/contracts';
import type { Spot, SpotStatus } from '@swelldays/contracts';
import { prisma } from 'server/db';
import { haversineDistance, EARTH_RADIUS_M } from 'server/lib/geoUtils';
import { runQuery } from 'server/lib/PrismaErrorMapper';

function mapToSpot(spot: PrismaSpot): Spot {
  return {
    id: spot.id,
    name: spot.name,
    location: spot.location,
    coords: { lat: Number(spot.lat), lng: Number(spot.lng) },
    status: spot.status,
  };
}

export interface SpotSearchFilter {
  search?: string;
}

export interface SpotCreateInput {
  name: string;
  location: string;
  lat: number;
  lng: number;
  status: SpotStatus;
  creatorId: string;
}

export type SpotCard = {
  id: string;
  name: string;
  location: string;
  totalMedia: number;
  media: { id: string; url: string; type: MediaType }[];
};

export interface ISpotRepository {
  findSpotList(filter: SpotSearchFilter): Promise<Spot[]>;
  findSpotsByBounds(swLat: number, swLng: number, neLat: number, neLng: number): Promise<Spot[]>;
  findSpotsNearby(lat: number, lng: number, radiusM: number): Promise<Spot[]>;
  findSpotById(id: string): Promise<Spot | null>;
  createSpot(data: SpotCreateInput): Promise<Spot>;
  findSpotCard(id: string): Promise<SpotCard | null>;
  isSpotFavorited(spotId: string, userId: string): Promise<boolean>;
  toggleSpotFavorite(spotId: string, userId: string): Promise<boolean>;
}

export class SpotRepository implements ISpotRepository {
  findSpotList(filter: SpotSearchFilter): Promise<Spot[]> {
    return runQuery(async () => {
      const rows = await prisma.spot.findMany({
        where: {
          AND: [
            { lat: { not: null } },
            { lng: { not: null } },
            filter.search
              ? {
                OR: [
                  { name: { contains: filter.search, mode: 'insensitive' } },
                  { location: { contains: filter.search, mode: 'insensitive' } },
                ],
              }
              : {},
          ],
        },
        orderBy: { name: 'asc' },
      });
      return rows.map(mapToSpot);
    });
  }

  async findSpotsNearby(lat: number, lng: number, radiusM: number): Promise<Spot[]> {
    const latDelta = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
    const lngDelta = latDelta / Math.cos((lat * Math.PI) / 180);

    const candidates = await runQuery(() =>
      prisma.spot.findMany({
        where: {
          lat: { gte: lat - latDelta, lte: lat + latDelta },
          lng: { gte: lng - lngDelta, lte: lng + lngDelta },
        },
      })
    );

    return candidates
      .filter((s) => {
        const dist = haversineDistance(lat, lng, Number(s.lat), Number(s.lng));
        return dist <= radiusM;
      })
      .map(mapToSpot);
  }

  // Note: does not handle antimeridian-crossing viewports (swLng > neLng). Safe while the
  // temporary overview bounds strategy is the only caller; needs a split query once real viewport bounds are wired.
  findSpotsByBounds(swLat: number, swLng: number, neLat: number, neLng: number): Promise<Spot[]> {
    return runQuery(async () => {
      const rows = await prisma.spot.findMany({
        where: {
          AND: [
            { lat: { not: null } },
            { lng: { not: null } },
            { lat: { gte: swLat, lte: neLat } },
            { lng: { gte: swLng, lte: neLng } },
          ],
        },
        orderBy: { name: 'asc' },
      });
      return rows.map(mapToSpot);
    });
  }

  findSpotById(id: string): Promise<Spot | null> {
    return runQuery(async () => {
      const spot = await prisma.spot.findUnique({ where: { id } });
      if (!spot) return null;
      return mapToSpot(spot);
    });
  }

  createSpot(data: SpotCreateInput): Promise<Spot> {
    return runQuery(async () => {
      const spot = await prisma.spot.create({ data });
      return mapToSpot(spot);
    });
  }

  findSpotCard(id: string): Promise<SpotCard | null> {
    return runQuery(async () => {
      const spot = await prisma.spot.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          location: true,
          _count: {
            select: { mediaItems: { where: { status: 'PUBLISHED', deletedAt: null } } },
          },
          mediaItems: {
            take: 5,
            where: { status: 'PUBLISHED', deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: { id: true, lightboxUrl: true, type: true },
          },
        },
      });

      if (!spot) return null;

      return {
        id: spot.id,
        name: spot.name,
        location: spot.location,
        totalMedia: spot._count.mediaItems,
        media: spot.mediaItems.map((m) => ({ id: m.id, url: m.lightboxUrl, type: m.type })),
      };
    });
  }

  isSpotFavorited(spotId: string, userId: string): Promise<boolean> {
    return runQuery(async () => {
      const row = await prisma.userFavoriteSpot.findUnique({
        where: { userId_spotId: { userId, spotId } },
      });
      return !!row;
    });
  }

  toggleSpotFavorite(spotId: string, userId: string): Promise<boolean> {
    return runQuery(async () => {
      const existing = await prisma.userFavoriteSpot.findUnique({
        where: { userId_spotId: { userId, spotId } },
      });

      if (existing) {
        await prisma.userFavoriteSpot.delete({ where: { userId_spotId: { userId, spotId } } });
        return false;
      }

      await prisma.userFavoriteSpot.create({ data: { userId, spotId } });
      return true;
    });
  }
}

export const spotRepository = new SpotRepository();
