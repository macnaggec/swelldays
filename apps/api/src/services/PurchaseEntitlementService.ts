import type { IPurchaseRepository } from 'server/repositories/PurchaseRepository';
import { purchaseRepository } from 'server/repositories/PurchaseRepository';
import type { ViewerMediaEntitlement } from '@swelldays/contracts/core';

export interface IPurchaseEntitlementService {
  getViewerMediaEntitlements(
    viewerId: string | null | undefined,
    mediaItemIds: string[],
  ): Promise<Map<string, ViewerMediaEntitlement>>;
}

export class PurchaseEntitlementService implements IPurchaseEntitlementService {
  constructor(
    private purchases: Pick<IPurchaseRepository, 'findPurchasedItemIds'> = purchaseRepository,
  ) {}

  async getViewerMediaEntitlements(
    viewerId: string | null | undefined,
    mediaItemIds: string[],
  ): Promise<Map<string, ViewerMediaEntitlement>> {
    const purchasedIds = viewerId && mediaItemIds.length > 0
      ? new Set(await this.purchases.findPurchasedItemIds(viewerId, mediaItemIds))
      : new Set<string>();

    return new Map(mediaItemIds.map((id) => [
      id,
      { purchaseState: purchasedIds.has(id) ? 'purchased' : 'none' },
    ]));
  }
}

export const purchaseEntitlementService = new PurchaseEntitlementService();
