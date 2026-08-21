import { prisma } from 'server/db';
import { runQuery } from 'server/lib/PrismaErrorMapper';
import type { MediaType } from '@prisma/client';

export type PurchaseWithMedia = {
  id: string;
  purchasedAt: Date;
  amountPaid: number;
  previewUrl: string | null;
  mediaItem: {
    id: string;
    type: MediaType;
    cloudinaryPublicId: string;
    thumbnailUrl: string;
  };
};

export interface IPurchaseRepository {
  findByBuyer(buyerId: string): Promise<PurchaseWithMedia[]>;
  findByBuyerAndMedia(buyerId: string, mediaItemId: string): Promise<PurchaseWithMedia | null>;
  findByDownloadToken(token: string): Promise<PurchaseWithMedia | null>;
  findByIdAndOrder(purchaseId: string, orderId: string): Promise<PurchaseWithMedia | null>;
  findByOrder(orderId: string): Promise<{ id: string; previewUrl: string | null; mediaItem: { id: string; thumbnailUrl: string } }[]>;
  findPurchasedItemIds(buyerId: string, itemIds: string[]): Promise<string[]>;
}

const PURCHASE_WITH_MEDIA_SELECT = {
  id: true,
  purchasedAt: true,
  amountPaid: true,
  previewUrl: true,
  mediaItem: {
    select: { id: true, type: true, cloudinaryPublicId: true, thumbnailUrl: true },
  },
} as const;

const PURCHASES_PAGE_LIMIT = 50;

export class PurchaseRepository implements IPurchaseRepository {
  findByBuyer(buyerId: string): Promise<PurchaseWithMedia[]> {
    return runQuery(() =>
      prisma.purchase.findMany({
        where: { buyerId },
        take: PURCHASES_PAGE_LIMIT,
        select: PURCHASE_WITH_MEDIA_SELECT,
        orderBy: { purchasedAt: 'desc' },
      })
    );
  }

  findByBuyerAndMedia(buyerId: string, mediaItemId: string): Promise<PurchaseWithMedia | null> {
    return runQuery(() =>
      prisma.purchase.findFirst({
        where: { buyerId, mediaItemId },
        select: PURCHASE_WITH_MEDIA_SELECT,
      })
    );
  }

  findByDownloadToken(token: string): Promise<PurchaseWithMedia | null> {
    return runQuery(() =>
      prisma.purchase.findUnique({
        where: { downloadToken: token },
        select: PURCHASE_WITH_MEDIA_SELECT,
      })
    );
  }

  findByIdAndOrder(purchaseId: string, orderId: string): Promise<PurchaseWithMedia | null> {
    return runQuery(() =>
      prisma.purchase.findFirst({
        where: { id: purchaseId, orderId },
        select: PURCHASE_WITH_MEDIA_SELECT,
      })
    );
  }

  findByOrder(orderId: string): Promise<{ id: string; previewUrl: string | null; mediaItem: { id: string; thumbnailUrl: string } }[]> {
    return runQuery(() =>
      prisma.purchase.findMany({
        where: { orderId },
        select: {
          id: true,
          previewUrl: true,
          mediaItem: { select: { id: true, thumbnailUrl: true } },
        },
      })
    );
  }

  findPurchasedItemIds(buyerId: string, itemIds: string[]): Promise<string[]> {
    return runQuery(async () => {
      const rows = await prisma.purchase.findMany({
        where: { buyerId, mediaItemId: { in: itemIds } },
        select: { mediaItemId: true },
      });
      return rows.map((r) => r.mediaItemId);
    });
  }
}

export const purchaseRepository = new PurchaseRepository();
