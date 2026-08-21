import type { MediaCore } from 'entities/Media';
import { formatShortDate } from 'shared/lib/dateUtils';
import type { CartItem } from './types';

type CartMediaItem = Pick<
  MediaCore,
  'id' | 'capturedAt' | 'thumbnailUrl' | 'lightboxUrl' | 'price'
> & {
  /** Present on items fetched without a single fixed spot context (e.g. an all-spots gallery). */
  spot?: { name: string } | null;
};

export function toCartItem(item: CartMediaItem, fallbackSpotName: string): CartItem {
  const spotName = item.spot?.name ?? fallbackSpotName;
  const capturedAt = item.capturedAt instanceof Date
    ? item.capturedAt.toISOString()
    : String(item.capturedAt);

  return {
    id: item.id,
    label: `${spotName} · ${formatShortDate(capturedAt)}`,
    spotName,
    capturedAt,
    thumbnailUrl: item.thumbnailUrl,
    lightboxUrl: item.lightboxUrl,
    priceCents: item.price ?? 0,
  };
}
