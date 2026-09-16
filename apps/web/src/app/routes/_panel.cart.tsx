import { createFileRoute } from '@tanstack/react-router';
import { Text } from '@mantine/core';
import { useCallback, useState } from 'react';
import { useCartStore, useCartCheckout } from 'entities/Commerce';
import type { CartItem } from 'entities/Commerce';
import { BaseGallery } from 'shared/ui/BaseGallery';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { CartCard, CartCheckoutFooter, CartLightbox } from 'features/Cart';
import { NOINDEX_HEAD } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/cart')({
  validateSearch: (search): { from?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  staticData: { appRouteIntent: 'siteWorkspace' },
  head: () => NOINDEX_HEAD,
  component: CartPanelRoute,
});

function CartPanelRoute() {
  const items = useCartStore((s) => s.items);
  const remove = useCartStore((s) => s.remove);
  const { handleCheckout, isPending, totalCents, status } = useCartCheckout();
  const [lightboxItem, setLightboxItem] = useState<CartItem | null>(null);

  const renderCartCard = useCallback(
    (item: CartItem) => (
      <CartCard
        item={item}
        onRemove={remove}
        onClick={() => setLightboxItem(item)}
      />
    ),
    [remove],
  );

  return (
    <>
      <PanelGalleryLayout
        footer={
          items.length > 0 ? (
            <CartCheckoutFooter
              totalCents={totalCents}
              isPending={isPending}
              status={status}
              onCheckout={handleCheckout}
            />
          ) : undefined
        }
      >
        <BaseGallery<CartItem>
          items={items}
          renderCard={renderCartCard}
          preservesScrollOnReflow={false}
          emptyState={
            <Text c="dimmed" size="sm" ta="center" mt="xl">
              Your cart is empty
            </Text>
          }
        />
      </PanelGalleryLayout>

      <CartLightbox
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onRemove={remove}
      />
    </>
  );
}
