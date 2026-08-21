import { useCallback, useMemo } from 'react';
import type { MediaCore } from 'entities/Media';
import { useCartStore } from './cartStore';
import { toCartItem } from './toCartItem';

type CartMediaItem = Pick<
  MediaCore,
  'id' | 'capturedAt' | 'thumbnailUrl' | 'lightboxUrl' | 'price'
> & {
  /** Present on items fetched without a single fixed spot context (e.g. an all-spots gallery). */
  spot?: { name: string } | null;
};

/**
 * Commerce-owned cart toggle logic.
 *
 * Returns the current set of cart item IDs and a stable `toggleCartItem`
 * callback. Callers do not need to import `useCartStore` or `toCartItem`
 * directly; all cart record construction goes through Commerce internals.
 */
export function useCartToggle(spotName: string) {
  const cartItems = useCartStore((s) => s.items);
  const add = useCartStore((s) => s.add);
  const remove = useCartStore((s) => s.remove);

  const cartItemIds = useMemo(
    () => new Set(cartItems.map((i) => i.id)),
    [cartItems],
  );

  const toggleCartItem = useCallback(
    (item: CartMediaItem) => {
      if (cartItemIds.has(item.id)) {
        remove(item.id);
      } else {
        add(toCartItem(item, spotName));
      }
    },
    [cartItemIds, remove, add, spotName],
  );

  return { cartItemIds, toggleCartItem };
}
