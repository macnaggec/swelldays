import { createFileRoute } from '@tanstack/react-router';
import { Center, Loader, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from 'shared/lib/trpc';
import { useCartStore } from 'entities/Commerce';
import { PurchaseCard, PurchaseLightbox, usePurchaseDownload } from 'features/Purchases';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { BaseGallery } from 'shared/ui/BaseGallery';

export const Route = createFileRoute('/_panel/me/collections/purchases')({
  validateSearch: (search): { order?: string } => ({
    order: typeof search.order === 'string' ? search.order : undefined,
  }),
  component: PurchasesTab,
});

function PurchasesTab() {
  const { order } = Route.useSearch();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: purchases = [], isLoading } = useQuery(trpc.checkout.myPurchases.queryOptions());
  const { download, isDownloading, isAnyDownloading } = usePurchaseDownload();
  const removeFromCart = useCartStore((s) => s.remove);

  const invalidatedOrderRef = useRef<string | null>(null);
  const [lightboxMediaItemId, setLightboxMediaItemId] = useState<string | null>(null);
  const lightboxPurchase = purchases.find(p => p.mediaItem.id === lightboxMediaItemId) ?? null;

  useEffect(() => {
    if (!order || invalidatedOrderRef.current === order) return;

    invalidatedOrderRef.current = order;
    void queryClient.invalidateQueries({ queryKey: trpc.checkout.myPurchases.queryKey() });
  }, [order, queryClient, trpc]);

  useEffect(() => {
    if (!order || isLoading || purchases.length === 0) return;

    purchases.forEach((purchase) => removeFromCart(purchase.mediaItem.id));
  }, [isLoading, order, purchases, removeFromCart]);

  if (isLoading) {
    return (
      <PanelGalleryLayout>
        <Center mih={200}>
          <Loader size="sm" />
        </Center>
      </PanelGalleryLayout>
    );
  }

  if (purchases.length === 0) {
    return (
      <PanelGalleryLayout>
        <Center mih={200}>
          <Text c="dimmed" size="sm">Your purchases will appear here.</Text>
        </Center>
      </PanelGalleryLayout>
    );
  }

  return (
    <>
      <PanelGalleryLayout>
        <BaseGallery
          items={purchases}
          aria-label="Purchases"
          renderCard={(purchase) => (
            <PurchaseCard
              purchase={purchase}
              isDownloading={isDownloading(purchase.mediaItem.id)}
              isAnyDownloading={isAnyDownloading}
              onDownload={download}
              onPreview={setLightboxMediaItemId}
            />
          )}
        />
      </PanelGalleryLayout>

      <PurchaseLightbox
        purchase={lightboxPurchase}
        onClose={() => setLightboxMediaItemId(null)}
        isDownloading={isDownloading(lightboxPurchase?.mediaItem.id ?? '')}
        isAnyDownloading={isAnyDownloading}
        onDownload={download}
      />
    </>
  );
}
