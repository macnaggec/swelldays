import { describe, expect, it, vi } from 'vitest';
import { PurchaseEntitlementService } from './PurchaseEntitlementService';

describe('PurchaseEntitlementService', () => {
  it('maps completed purchases to viewer media entitlements', async () => {
    const purchases = {
      findPurchasedItemIds: vi.fn().mockResolvedValue(['media-2']),
    };
    const service = new PurchaseEntitlementService(purchases);

    const result = await service.getViewerMediaEntitlements('buyer-1', ['media-1', 'media-2']);

    expect(purchases.findPurchasedItemIds).toHaveBeenCalledWith('buyer-1', ['media-1', 'media-2']);
    expect(result).toEqual(new Map([
      ['media-1', { purchaseState: 'none' }],
      ['media-2', { purchaseState: 'purchased' }],
    ]));
  });

  it('returns no-purchase entitlements without querying purchases for anonymous viewers', async () => {
    const purchases = {
      findPurchasedItemIds: vi.fn(),
    };
    const service = new PurchaseEntitlementService(purchases);

    const result = await service.getViewerMediaEntitlements(null, ['media-1']);

    expect(purchases.findPurchasedItemIds).not.toHaveBeenCalled();
    expect(result).toEqual(new Map([
      ['media-1', { purchaseState: 'none' }],
    ]));
  });
});
