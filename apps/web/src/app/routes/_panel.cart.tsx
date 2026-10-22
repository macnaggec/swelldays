import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Group, Loader, Modal, Overlay, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCartStore, useCartCheckout } from 'entities/Commerce';
import type { CartItem } from 'entities/Commerce';
import { BaseGallery } from 'shared/ui/BaseGallery';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { PanelLayoutOverlay } from 'shared/ui/PanelLayout';
import { CartCard, CartCheckoutFooter, CartLightbox } from 'features/Cart';
import { NOINDEX_HEAD } from 'shared/lib/seoMeta';
import { AppButton } from 'shared/ui/AppButton';
import { notify } from 'shared/lib/notifications';

export const Route = createFileRoute('/_panel/cart')({
  validateSearch: (search): { from?: string; order?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
    order: typeof search.order === 'string' ? search.order : undefined,
  }),
  staticData: { appRouteIntent: 'siteWorkspace' },
  head: () => NOINDEX_HEAD,
  component: CartPanelRoute,
});

function CartPanelRoute() {
  const { order } = Route.useSearch();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 48em)');
  const items = useCartStore((s) => s.items);
  const remove = useCartStore((s) => s.remove);
  const {
    handleCheckout,
    isPending,
    totalCents,
    status,
    selfPurchaseItemIds,
    removeSelfPurchaseItems,
  } = useCartCheckout(order);
  const paidOrderId = status?.state === 'paid' ? status.orderId : null;
  const isCheckingPayment = isPending && paidOrderId === null;
  const [lightboxItem, setLightboxItem] = useState<CartItem | null>(null);
  const [isOpeningPurchases, setIsOpeningPurchases] = useState(false);
  const notifiedOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (paidOrderId === null || notifiedOrderRef.current === paidOrderId) return;
    notifiedOrderRef.current = paidOrderId;
    notify.success('Your purchase is ready to download.', 'Payment complete');
  }, [paidOrderId]);

  const handleRemove = useCallback((id: string) => {
    if (!isPending) remove(id);
  }, [isPending, remove]);

  const renderCartCard = useCallback(
    (item: CartItem) => (
      <CartCard
        item={item}
        onRemove={handleRemove}
        onClick={() => {
          if (!isPending) setLightboxItem(item);
        }}
        disabled={isPending}
      />
    ),
    [handleRemove, isPending],
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

      <PanelLayoutOverlay>
        {isCheckingPayment ? (
          <Overlay
            center
            blur={3}
            backgroundOpacity={0.72}
            color="var(--mantine-color-dark-8)"
            data-testid="cart-payment-lock"
            aria-live="polite"
            aria-busy="true"
          >
            <Stack align="center" gap="sm">
              <Loader color="white" />
              <Text c="white" fw={600} ta="center">
                Checking payment…
              </Text>
            </Stack>
          </Overlay>
        ) : null}
      </PanelLayoutOverlay>

      <CartLightbox
        item={lightboxItem}
        onClose={() => setLightboxItem(null)}
        onRemove={handleRemove}
        disabled={isPending}
      />

      <Modal
        opened={selfPurchaseItemIds.length > 0}
        onClose={() => undefined}
        title="Remove your own items"
        centered
        fullScreen={isMobile}
        size="sm"
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
      >
        <Stack gap="lg">
          <Text ta="center">
            You cannot purchase media you uploaded. Remove these items from your cart to continue.
          </Text>
          <Group justify="center" w="100%">
            <AppButton
              tone="positive"
              fullWidth={isMobile}
              onClick={removeSelfPurchaseItems}
            >
              Remove my items
            </AppButton>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={paidOrderId !== null}
        onClose={() => undefined}
        title="Purchase complete"
        centered
        fullScreen={isMobile}
        size="sm"
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
      >
        <Stack
          gap="lg"
          data-testid="purchase-complete-layout"
          data-mobile={isMobile ? 'true' : 'false'}
        >
          <Text ta="center">Your purchase is ready to download.</Text>
          <Group justify="center" w="100%">
            <AppButton
              tone="positive"
              fullWidth={isMobile}
              data-full-width={isMobile ? 'true' : 'false'}
              disabled={isOpeningPurchases}
              onClick={() => {
                if (paidOrderId !== null && !isOpeningPurchases) {
                  setIsOpeningPurchases(true);
                  void navigate({ href: `/me/collections/purchases?order=${paidOrderId}` });
                }
              }}
            >
              {isOpeningPurchases ? 'Opening purchases…' : 'View purchases'}
            </AppButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
