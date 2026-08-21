import { MediaItem as PrismaMediaItem } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import { MEDIA_STATUS } from '@swelldays/contracts';
import { getCapturedMediaCalendarDayKey } from '@swelldays/contracts';
import type { DraftMedia, MediaStatus as DomainMediaStatus, PublicMedia } from '@swelldays/contracts';
import { mapToDraftMedia } from './mappers';

/** Public projection before the service attaches the viewer's entitlement. */
export type AttributedPublishedMedia = Omit<PublicMedia, 'viewerEntitlement'>;

export type SpotMediaPage = {
  items: AttributedPublishedMedia[];
  nextCursor: string | null;
  /** Cursor toward newer items than this page's first item; see findPublishedBySpotBefore. */
  prevCursor: string | null;
};

export interface PublishedSpotMediaScope {
  spotId?: string;
  sortOrder?: 'asc' | 'desc';
  dateFrom?: Date;
  dateTo?: Date;
  favoriteUserId?: string;
}

export interface PublishedSpotMediaFilter extends PublishedSpotMediaScope {
  cursor?: string;
  /**
   * Seeds the first page of a jump to a distant day: bounds capturedAt to
   * at-or-before (desc) / at-or-after (asc) this instant. Only consulted when
   * cursor is absent — once a cursor exists the cursor alone defines position,
   * and re-applying the anchor would wrongly cap how far fetchPreviousPage
   * (findPublishedBySpotBefore) can reach back toward the present.
   */
  anchorCapturedAt?: Date;
  limit: number;
}

export interface PublishedSpotMediaBeforeFilter extends PublishedSpotMediaScope {
  /** Required — "before" fetches items newer than a known position, not a fresh start. */
  cursor: string;
  limit: number;
}

function publishedSpotMediaWhere(filter: PublishedSpotMediaScope): Prisma.MediaItemWhereInput {
  return {
    spotId: filter.spotId,
    status: MEDIA_STATUS.PUBLISHED,
    deletedAt: null,
    ...(filter.dateFrom || filter.dateTo ? {
      capturedAt: {
        ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
        ...(filter.dateTo ? { lt: filter.dateTo } : {}),
      },
    } : {}),
    ...(filter.favoriteUserId ? {
      spot: { favoritedBy: { some: { userId: filter.favoriteUserId } } },
    } : {}),
  };
}

type MediaCursor = { capturedAt: Date; id: string };

function encodeMediaCursor(cursor: MediaCursor): string {
  return Buffer.from(JSON.stringify([cursor.capturedAt.toISOString(), cursor.id])).toString('base64url');
}

function decodeMediaCursor(cursor: string): MediaCursor {
  const [capturedAtIso, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as [string, string];
  return { capturedAt: new Date(capturedAtIso), id };
}

/**
 * Prisma's built-in `cursor`/`skip` pagination compares only the single id
 * field it is given, so ties on `capturedAt` fall back to whatever order
 * Postgres happens to return them in — not guaranteed stable across queries.
 * This builds the (capturedAt, id) tuple comparison explicitly: capturedAt
 * orders by sortOrder, id always ascending as the fixed tiebreaker, so
 * "after the cursor" has one unambiguous meaning regardless of scan order.
 */
function afterMediaCursorWhere(sortOrder: 'asc' | 'desc', cursor: MediaCursor): Prisma.MediaItemWhereInput {
  const strictCapturedAt = sortOrder === 'desc' ? { lt: cursor.capturedAt } : { gt: cursor.capturedAt };
  return {
    OR: [
      { capturedAt: strictCapturedAt },
      { capturedAt: cursor.capturedAt, id: { gt: cursor.id } },
    ],
  };
}

/** The mirror of afterMediaCursorWhere: items strictly before the cursor in the forward (capturedAt, id-asc) order. */
function beforeMediaCursorWhere(sortOrder: 'asc' | 'desc', cursor: MediaCursor): Prisma.MediaItemWhereInput {
  const strictCapturedAt = sortOrder === 'desc' ? { gt: cursor.capturedAt } : { lt: cursor.capturedAt };
  return {
    OR: [
      { capturedAt: strictCapturedAt },
      { capturedAt: cursor.capturedAt, id: { lt: cursor.id } },
    ],
  };
}

/** Seeds the first page of a jump: capturedAt at-or-before (desc) / at-or-after (asc) the anchor. */
function anchorMediaWhere(sortOrder: 'asc' | 'desc', anchorCapturedAt: Date): Prisma.MediaItemWhereInput {
  return { capturedAt: sortOrder === 'desc' ? { lte: anchorCapturedAt } : { gte: anchorCapturedAt } };
}

function mapToAttributedPublishedMedia(
  row: PrismaMediaItem & {
    photographer: { id: string; name: string | null } | null;
    spot: { id: string; name: string } | null;
  },
): AttributedPublishedMedia {
  return {
    id: row.id,
    type: row.type,
    lightboxUrl: row.lightboxUrl,
    thumbnailUrl: row.thumbnailUrl,
    price: row.price!,
    capturedAt: row.capturedAt,
    spotId: row.spotId!,
    photographerId: row.photographerId,
    photographer: row.photographer,
    spot: row.spot,
    width: row.width,
    height: row.height,
  };
}

export type UpdateMediaData = { price?: number; status?: DomainMediaStatus; capturedAt?: Date; spotId?: string };

export type MediaFulfillmentItem = {
  id: string;
  price: number;
  photographerId: string;
  cloudinaryPublicId: string;
};

export interface IMediaRepository {
  findById(id: string): Promise<DraftMedia | null>;
  findByCloudinaryPublicId(publicId: string): Promise<{ id: string; photographerId: string } | null>;
  updateMedia(id: string, data: UpdateMediaData): Promise<DraftMedia>;
  updateManyMedia(ids: string[], data: UpdateMediaData): Promise<void>;
  softDelete(id: string): Promise<DraftMedia>;
  hardDelete(id: string): Promise<void>;
  hardDeleteMany(ids: string[]): Promise<void>;
  findByIds(ids: string[]): Promise<{ id: string; sessionId: string; status: DomainMediaStatus; price: number | null; photographerId: string; cloudinaryPublicId: string; type: string }[]>;
  findByIdsForFulfillment(ids: string[]): Promise<MediaFulfillmentItem[]>;
  findPublishedByPhotographer(photographerId: string): Promise<AttributedPublishedMedia[]>;
  findPublishedBySession(sessionId: string): Promise<AttributedPublishedMedia[]>;
  hasDraftsByUser(photographerId: string): Promise<boolean>;
  findDraftsByUser(photographerId: string): Promise<DraftMedia[]>;
  findDraftsBySpot(spotId: string, photographerId: string): Promise<DraftMedia[]>;
  findPublishedBySpot(filter: PublishedSpotMediaFilter): Promise<SpotMediaPage>;
  findPublishedBySpotBefore(filter: PublishedSpotMediaBeforeFilter): Promise<SpotMediaPage>;
  findPublishedDates(filter: PublishedSpotMediaScope): Promise<Date[]>;
}

export class MediaRepository implements IMediaRepository {
  findById(id: string): Promise<DraftMedia | null> {
    return runQuery(async () => {
      const row = await prisma.mediaItem.findUnique({ where: { id } });
      return row ? mapToDraftMedia(row) : null;
    });
  }

  findByCloudinaryPublicId(publicId: string): Promise<{ id: string; photographerId: string } | null> {
    return runQuery(async () => {
      const row = await prisma.mediaItem.findFirst({
        where: { cloudinaryPublicId: publicId },
        select: { id: true, photographerId: true },
      });
      return row ?? null;
    });
  }

  updateMedia(id: string, data: UpdateMediaData): Promise<DraftMedia> {
    return runQuery(async () => {
      const row = await prisma.mediaItem.update({ where: { id }, data });
      return mapToDraftMedia(row);
    });
  }

  updateManyMedia(ids: string[], data: UpdateMediaData): Promise<void> {
    return runQuery(async () => {
      await prisma.mediaItem.updateMany({ where: { id: { in: ids } }, data });
    });
  }

  softDelete(id: string): Promise<DraftMedia> {
    return runQuery(async () => {
      const row = await prisma.mediaItem.update({
        where: { id },
        data: { status: MEDIA_STATUS.DELETED, deletedAt: new Date() },
      });
      return mapToDraftMedia(row);
    });
  }

  findByIds(ids: string[]): Promise<{ id: string; sessionId: string; status: DomainMediaStatus; price: number | null; photographerId: string; cloudinaryPublicId: string; type: string }[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, sessionId: true, status: true, price: true, photographerId: true, cloudinaryPublicId: true, type: true },
      });
      return rows as { id: string; sessionId: string; status: DomainMediaStatus; price: number | null; photographerId: string; cloudinaryPublicId: string; type: string }[];
    });
  }

  findByIdsForFulfillment(ids: string[]): Promise<MediaFulfillmentItem[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: {
          id: { in: ids },
          status: MEDIA_STATUS.PUBLISHED,
          deletedAt: null,
          price: { not: null },
        },
        select: { id: true, price: true, photographerId: true, cloudinaryPublicId: true },
      });
      return rows.map(r => {
        if (r.price === null) throw new Error('Invariant: null price after price filter');
        return { ...r, price: r.price };
      });
    });
  }

  findPublishedByPhotographer(photographerId: string): Promise<AttributedPublishedMedia[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: { photographerId, status: MEDIA_STATUS.PUBLISHED, deletedAt: null },
        orderBy: { capturedAt: 'desc' },
        include: {
          photographer: { select: { id: true, name: true } },
          spot: { select: { id: true, name: true } },
        },
      });
      return rows.map(mapToAttributedPublishedMedia);
    });
  }

  findPublishedBySession(sessionId: string): Promise<AttributedPublishedMedia[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: {
          sessionId,
          status: MEDIA_STATUS.PUBLISHED,
          deletedAt: null,
        },
        orderBy: { capturedAt: 'asc' },
        include: {
          photographer: { select: { id: true, name: true } },
          spot: { select: { id: true, name: true } },
        },
      });
      return rows.map(mapToAttributedPublishedMedia);
    });
  }

  hardDelete(id: string): Promise<void> {
    return runQuery(async () => {
      await prisma.mediaItem.delete({ where: { id } });
    });
  }

  hardDeleteMany(ids: string[]): Promise<void> {
    return runQuery(async () => {
      await prisma.mediaItem.deleteMany({ where: { id: { in: ids } } });
    });
  }

  /** True when legacy unpublished media rows still exist for a photographer. */
  hasDraftsByUser(photographerId: string): Promise<boolean> {
    return runQuery(async () => {
      const count = await prisma.mediaItem.count({
        where: {
          photographerId,
          status: MEDIA_STATUS.DRAFT,
          deletedAt: null,
          session: { mediaItems: { none: { price: { not: null } } } },
        },
      });
      return count > 0;
    });
  }

  findDraftsByUser(photographerId: string): Promise<DraftMedia[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: {
          photographerId,
          status: MEDIA_STATUS.DRAFT,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(mapToDraftMedia);
    });
  }

  findDraftsBySpot(spotId: string, photographerId: string): Promise<DraftMedia[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: { spotId, photographerId, status: MEDIA_STATUS.DRAFT, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(mapToDraftMedia);
    });
  }

  /** Published media, optionally scoped to a single spot; unfiltered lists across all spots. */
  findPublishedBySpot(filter: PublishedSpotMediaFilter): Promise<SpotMediaPage> {
    return runQuery(async () => {
      const sortOrder = filter.sortOrder ?? 'desc';
      const rows = await prisma.mediaItem.findMany({
        where: {
          ...publishedSpotMediaWhere(filter),
          ...(filter.cursor
            ? afterMediaCursorWhere(sortOrder, decodeMediaCursor(filter.cursor))
            : filter.anchorCapturedAt
              ? anchorMediaWhere(sortOrder, filter.anchorCapturedAt)
              : {}),
        },
        orderBy: [{ capturedAt: sortOrder }, { id: 'asc' }],
        take: filter.limit + 1,
        include: {
          photographer: { select: { id: true, name: true } },
          spot: { select: { id: true, name: true } },
        },
      });

      const hasMore = rows.length > filter.limit;
      const items = (hasMore ? rows.slice(0, filter.limit) : rows).map(mapToAttributedPublishedMedia);
      const first = items[0];
      const last = items[items.length - 1];
      const nextCursor = hasMore && last ? encodeMediaCursor({ capturedAt: last.capturedAt, id: last.id }) : null;
      // A cursor or anchor guarantees something exists before this page (the position we
      // continued from); prevCursor only needs to be precise when this is a true fresh
      // start (no cursor, no anchor), where nothing can come before it by construction.
      const prevCursor = (filter.cursor || filter.anchorCapturedAt) && first
        ? encodeMediaCursor({ capturedAt: first.capturedAt, id: first.id })
        : null;

      return { items, nextCursor, prevCursor };
    });
  }

  /**
   * The reverse of findPublishedBySpot: fetches items newer than cursor (in
   * display order), for scrolling back toward the present after a jump.
   */
  findPublishedBySpotBefore(filter: PublishedSpotMediaBeforeFilter): Promise<SpotMediaPage> {
    return runQuery(async () => {
      const sortOrder = filter.sortOrder ?? 'desc';
      const reverseCapturedAt = sortOrder === 'desc' ? 'asc' : 'desc';
      const cursor = decodeMediaCursor(filter.cursor);
      const rows = await prisma.mediaItem.findMany({
        where: {
          ...publishedSpotMediaWhere(filter),
          ...beforeMediaCursorWhere(sortOrder, cursor),
        },
        // Closest-to-cursor first: the exact reverse of the forward [capturedAt, id-asc] order.
        orderBy: [{ capturedAt: reverseCapturedAt }, { id: 'desc' }],
        take: filter.limit + 1,
        include: {
          photographer: { select: { id: true, name: true } },
          spot: { select: { id: true, name: true } },
        },
      });

      const hasMore = rows.length > filter.limit;
      const closestFirst = hasMore ? rows.slice(0, filter.limit) : rows;
      // Reverse back to normal display order before use.
      const items = closestFirst.slice().reverse().map(mapToAttributedPublishedMedia);
      const first = items[0];
      const last = items[items.length - 1];
      const prevCursor = hasMore && first ? encodeMediaCursor({ capturedAt: first.capturedAt, id: first.id }) : null;
      const nextCursor = last ? encodeMediaCursor({ capturedAt: last.capturedAt, id: last.id }) : null;

      return { items, nextCursor, prevCursor };
    });
  }

  /** Compact chronology for date navigation: one entry per distinct calendar day, newest-first or oldest-first. */
  findPublishedDates(filter: PublishedSpotMediaScope): Promise<Date[]> {
    return runQuery(async () => {
      const rows = await prisma.mediaItem.findMany({
        where: publishedSpotMediaWhere(filter),
        orderBy: { capturedAt: filter.sortOrder ?? 'desc' },
        select: { capturedAt: true },
      });
      const seenDays = new Set<string>();
      const days: Date[] = [];
      for (const { capturedAt } of rows) {
        const dayKey = getCapturedMediaCalendarDayKey(capturedAt);
        if (seenDays.has(dayKey)) continue;
        seenDays.add(dayKey);
        days.push(capturedAt);
      }
      return days;
    });
  }
}

export const mediaRepository = new MediaRepository();
