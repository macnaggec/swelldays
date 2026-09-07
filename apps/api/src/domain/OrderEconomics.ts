import type { MediaType } from '@prisma/client';
import type { ApiConfig } from 'server/config/decodeApiEnvironment';

export const ORDER_CURRENCY = 'USD' as const;
export type OrderCurrency = typeof ORDER_CURRENCY;
export type PaymentProvider = ApiConfig['payment']['provider'];

export const FEE_POLICY_VERSIONS = ['standard-20-v1', 'paddle-50c-30-v1'] as const;
export type FeePolicyVersion = (typeof FEE_POLICY_VERSIONS)[number];

export type CheckoutCatalogItem = {
  id: string;
  status: string;
  price: number | null;
  photographerId: string;
  cloudinaryPublicId: string;
  type: MediaType;
};

export type PricedCheckoutCatalogItem = CheckoutCatalogItem & { price: number };

export type OrderLineSnapshot = {
  mediaItemId: string;
  unitAmountCents: number;
  currency: OrderCurrency;
  sellerId: string;
  feePolicyVersion: FeePolicyVersion;
  platformFeeAmount: number;
  sellerEarningsAmount: number;
  deliverablePublicId: string;
  deliverableType: MediaType;
};

export type PersistedOrderLine = {
  id: string;
  mediaItemId: string;
  unitAmountCents: number | null;
  currency: string | null;
  sellerId: string | null;
  feePolicyVersion: string | null;
  platformFeeAmount: number | null;
  sellerEarningsAmount: number | null;
  deliverablePublicId: string | null;
  deliverableType: MediaType | null;
};

function isOrderCurrency(value: string | null): value is OrderCurrency {
  return value === ORDER_CURRENCY;
}

function isFeePolicyVersion(value: string | null): value is FeePolicyVersion {
  return FEE_POLICY_VERSIONS.some((version) => version === value);
}

export function snapshotOrderLine(
  item: PricedCheckoutCatalogItem,
  paymentProvider: PaymentProvider,
): OrderLineSnapshot {
  // Paddle is merchant of record: VAT is extracted from the sticker price
  // before it ever reaches the platform (passed through to tax authorities,
  // not platform revenue), and Paddle additionally deducts its own processing
  // fee (5% + $0.50) from what's left. A flat 20% cut of the sticker price
  // doesn't account for either — on a cheap item the $0.50 alone can exceed
  // the platform's entire flat-rate cut, putting the platform underwater on
  // that sale once the seller is paid 80% of the full sticker price. This
  // mirrors Paddle's own fee shape (fixed + percentage) so the platform's
  // cut always covers it, plus a 25% margin on top of that cost.
  const platformFeeAmount = paymentProvider === 'paddle'
    ? Math.min(item.price, Math.round(50 + item.price * 0.30))
    : Math.round(item.price * 0.20);

  return {
    mediaItemId: item.id,
    unitAmountCents: item.price,
    currency: ORDER_CURRENCY,
    sellerId: item.photographerId,
    feePolicyVersion: paymentProvider === 'paddle' ? 'paddle-50c-30-v1' : 'standard-20-v1',
    platformFeeAmount,
    sellerEarningsAmount: item.price - platformFeeAmount,
    deliverablePublicId: item.cloudinaryPublicId,
    deliverableType: item.type,
  };
}

export function requireOrderLineSnapshot(
  line: PersistedOrderLine,
): OrderLineSnapshot & { id: string } {
  const {
    id,
    mediaItemId,
    unitAmountCents,
    currency,
    sellerId,
    feePolicyVersion,
    platformFeeAmount,
    sellerEarningsAmount,
    deliverablePublicId,
    deliverableType,
  } = line;

  if (
    unitAmountCents === null
    || currency === null
    || sellerId === null
    || feePolicyVersion === null
    || platformFeeAmount === null
    || sellerEarningsAmount === null
    || deliverablePublicId === null
    || deliverableType === null
    || !isOrderCurrency(currency)
    || !isFeePolicyVersion(feePolicyVersion)
    || unitAmountCents < 0
    || platformFeeAmount < 0
    || sellerEarningsAmount < 0
    || unitAmountCents !== platformFeeAmount + sellerEarningsAmount
  ) {
    throw new Error(`Order item ${id} has an invalid or incomplete economics snapshot`);
  }

  return {
    id,
    mediaItemId,
    unitAmountCents,
    currency,
    sellerId,
    feePolicyVersion,
    platformFeeAmount,
    sellerEarningsAmount,
    deliverablePublicId,
    deliverableType,
  };
}
