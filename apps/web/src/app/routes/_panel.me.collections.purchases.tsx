import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Center, Skeleton, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTRPC } from 'shared/lib/trpc';
import { useCartStore } from 'entities/Commerce';
import { PurchaseCard, PurchaseLightbox, usePurchaseDownload } from 'features/Purchases';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { BaseGallery } from 'shared/ui/BaseGallery';
import { PanelCollectionGrid } from 'shared/ui/PanelCollectionGrid';
import { AppButton } from 'shared/ui/AppButton';
import type { BuyerCheckoutStatus } from '@swelldays/contracts/validation/checkout';

export const Route = createFileRoute('/_panel/me/collections/purchases')({
  validateSearch: (search): { order?: string } => ({
    order: typeof search.order === 'string' ? search.order : undefined,
  }),
  component: PurchasesTab,
});

function PurchasesTab() {
  const { order } = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: purchases = [], isLoading } = useQuery(trpc.checkout.myPurchases.queryOptions());
  const { data: checkoutStatus } = useQuery({
    ...trpc.checkout.status.queryOptions({
      orderId: order ?? '00000000-0000-4000-8000-000000000000',
    }),
    enabled: order !== undefined,
    refetchInterval: (query) => isTransientCheckoutStatus(query.state.data) ? 2_000 : false,
  });
  const { download, isDownloading, isAnyDownloading } = usePurchaseDownload();
  const removeFromCart = useCartStore((s) => s.remove);

  const invalidatedOrderRef = useRef<string | null>(null);
  const [lightboxMediaItemId, setLightboxMediaItemId] = useState<string | null>(null);
  const lightboxPurchase = purchases.find(p => p.mediaItem.id === lightboxMediaItemId) ?? null;

  useEffect(() => {
    if (!order || checkoutStatus?.state !== 'paid' || invalidatedOrderRef.current === order) return;

    invalidatedOrderRef.current = order;
    const purchasesQueryKey = trpc.checkout.myPurchases.queryKey();
    void queryClient.invalidateQueries({ queryKey: purchasesQueryKey }).then(() => {
      const refreshedPurchases = queryClient.getQueryData<typeof purchases>(purchasesQueryKey) ?? [];
      refreshedPurchases.forEach((purchase) => removeFromCart(purchase.mediaItem.id));
      void navigate({
        to: '/me/collections/purchases',
        search: {},
        replace: true,
      });
    });
  }, [checkoutStatus?.state, navigate, order, purchases, queryClient, removeFromCart, trpc]);

  const checkoutNotice = renderCheckoutNotice(checkoutStatus);

  if (isLoading) {
    // Same grid PanelCollectionGrid gives BaseGallery below, so the column count matches
    // once real cards load; each tile mirrors PurchaseCard/BaseCard's aspect-ratio: 16/10.
    return (
      <PanelGalleryLayout>
        <PanelCollectionGrid preview>
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} height={0} style={{ aspectRatio: '16 / 10', borderRadius: 'var(--wa-radius-control-md)' }} />
          ))}
        </PanelCollectionGrid>
      </PanelGalleryLayout>
    );
  }

  if (purchases.length === 0) {
    return (
      <PanelGalleryLayout>
        <Center mih={200}>
          <Stack align="center" gap="sm">
            {checkoutNotice}
            {!checkoutNotice && <Text c="dimmed" size="sm">Your purchases will appear here.</Text>}
          </Stack>
        </Center>
      </PanelGalleryLayout>
    );
  }

  return (
    <>
      <PanelGalleryLayout>
        {checkoutNotice}
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

function isTransientCheckoutStatus(status: BuyerCheckoutStatus | undefined): boolean {
  return status?.state === 'creating' || status?.state === 'unknown' || status?.state === 'processing';
}

function renderCheckoutNotice(status: BuyerCheckoutStatus | undefined) {
  if (isTransientCheckoutStatus(status)) {
    return <Text c="dimmed" size="sm">Checking payment status…</Text>;
  }
  if (status?.state === 'failed') {
    return <Text c="red" size="sm">Payment failed. You can retry from your cart.</Text>;
  }
  if (status?.state === 'ready') {
    return (
      <AppButton
        tone="positive"
        onClick={() => { window.location.href = status.checkoutUrl; }}
      >
        Resume checkout
      </AppButton>
    );
  }
  return null;
}
