import { fireEvent, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { Route } from './_panel.cart';

const mocks = vi.hoisted(() => ({
  items: [] as Array<{
    id: string;
    label: string;
    thumbnailUrl: string;
    spotName: string;
    capturedAt: string;
    priceCents: number;
  }>,
  remove: vi.fn(),
  handleCheckout: vi.fn(),
  navigate: vi.fn(),
  notifySuccess: vi.fn(),
  isMobile: false,
  isPending: false,
  selfPurchaseItemIds: [] as string[],
  removeSelfPurchaseItems: vi.fn(),
  status: null as { state: 'paid' | 'processing'; orderId: string } | null,
}));

vi.mock('@mantine/hooks', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mantine/hooks')>(),
  useMediaQuery: () => mocks.isMobile,
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { success: mocks.notifySuccess },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => ({}),
  }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('entities/Commerce', () => ({
  useCartStore: (selector: (state: { items: typeof mocks.items; remove: typeof mocks.remove }) => unknown) => selector({
    items: mocks.items,
    remove: mocks.remove,
  }),
  useCartCheckout: () => ({
    handleCheckout: mocks.handleCheckout,
    isPending: mocks.isPending,
    totalCents: 1200,
    status: mocks.status,
    selfPurchaseItemIds: mocks.selfPurchaseItemIds,
    removeSelfPurchaseItems: mocks.removeSelfPurchaseItems,
  }),
}));

vi.mock('features/Cart', () => ({
  CartCard: ({ item }: { item: { label: string } }) => <article>{item.label}</article>,
  CartLightbox: () => null,
  CartCheckoutFooter: ({ totalCents }: { totalCents: number }) => (
    <div>
      <span>{`$${totalCents / 100}`}</span>
      <button type="button">Checkout</button>
    </div>
  ),
}));

// Cart is a siteWorkspace route (M06c); PanelCollectionGrid (inside BaseGallery) now
// derives its own column density from the shell policy, so every render here needs a
// real AppShellLayoutPolicyProvider ancestor.
function renderCart(ui: ReactNode, drawerPresentation?: 'sideWorkspace') {
  const panelLayout = <PanelLayout>{ui}</PanelLayout>;

  return render(
    <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
      {drawerPresentation
        ? (
          <PanelScrollChromeStateProvider value={{ hidden: false, drawerPresentation }}>
            {panelLayout}
          </PanelScrollChromeStateProvider>
        )
        : panelLayout}
    </AppShellLayoutPolicyProvider>,
  );
}

describe('CartPanelRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isMobile = false;
    mocks.isPending = false;
    mocks.selfPurchaseItemIds = [];
    mocks.status = null;
  });

  it('renders the cart gallery inside the shared panel gallery inset', () => {
    mocks.items = [];
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />);

    expect(screen.getByText('Your cart is empty').closest('[data-panel-gallery-inset]')).not.toBeNull();
  });

  it('renders checkout in the shared panel footer', () => {
    mocks.items = [{
      id: 'cart-item-1',
      label: 'Cart item',
      thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu',
      capturedAt: '2026-06-01T06:00:00.000Z',
      priceCents: 1200,
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />);

    expect(screen.getByRole('button', { name: 'Checkout' }).closest('[data-panel-layout-footer]')).not.toBeNull();
    expect(screen.getByText('$12')).not.toBeNull();
  });

  it('floats the checkout footer over content once the drawer is a sideWorkspace', () => {
    mocks.items = [{
      id: 'cart-item-1',
      label: 'Cart item',
      thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu',
      capturedAt: '2026-06-01T06:00:00.000Z',
      priceCents: 1200,
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;

    const { container } = renderCart(<Component />, 'sideWorkspace');

    const root = container.querySelector('[data-panel-layout]') as HTMLElement;
    expect(root).toHaveAttribute('data-drawer-presentation', 'sideWorkspace');
    expect(root.style.getPropertyValue('--wa-panel-footer-height')).toBe('0px');
    expect(screen.getByRole('button', { name: 'Checkout' }).closest('[data-panel-layout-footer]')).not.toBeNull();
  });

  it('shows purchase confirmation and navigates only after the buyer chooses View purchases', () => {
    mocks.items = [{
      id: 'cart-item-1',
      label: 'Cart item',
      thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu',
      capturedAt: '2026-06-01T06:00:00.000Z',
      priceCents: 1200,
    }];
    mocks.status = { state: 'paid', orderId: 'order-1' };
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />);

    expect(screen.getByRole('dialog', { name: 'Purchase complete' })).toBeVisible();
    expect(screen.queryByTestId('cart-payment-lock')).toBeNull();
    expect(mocks.notifySuccess).toHaveBeenCalledWith(
      'Your purchase is ready to download.',
      'Payment complete',
    );
    expect(mocks.navigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'View purchases' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      href: '/me/collections/purchases?order=order-1',
    });
    expect(screen.getByRole('button', { name: 'Opening purchases…' })).toBeDisabled();
  });

  it('uses the mobile purchase-complete layout on narrow screens', () => {
    mocks.items = [{
      id: 'cart-item-1', label: 'Cart item', thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu', capturedAt: '2026-06-01T06:00:00.000Z', priceCents: 1200,
    }];
    mocks.status = { state: 'paid', orderId: 'order-1' };
    mocks.isMobile = true;
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />);

    expect(screen.getByTestId('purchase-complete-layout')).toHaveAttribute('data-mobile', 'true');
    expect(screen.getByRole('button', { name: 'View purchases' })).toHaveAttribute('data-full-width', 'true');
  });

  it('covers the complete cart panel while payment is being checked', () => {
    mocks.items = [{
      id: 'cart-item-1', label: 'Cart item', thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu', capturedAt: '2026-06-01T06:00:00.000Z', priceCents: 1200,
    }];
    mocks.isPending = true;
    mocks.status = { state: 'processing', orderId: 'order-1' };
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />, 'sideWorkspace');

    const lock = screen.getByTestId('cart-payment-lock');
    expect(lock).toHaveTextContent('Checking payment…');
    expect(lock.closest('[data-panel-layout-overlay-target]')).not.toBeNull();
    expect(lock.closest('[data-panel-scroll-owner]')).toBeNull();
  });

  it('blocks checkout with a remediation modal when the cart contains own media', () => {
    mocks.items = [{
      id: 'cart-item-1', label: 'Own item', thumbnailUrl: 'https://example.com/cart.jpg',
      spotName: 'Malibu', capturedAt: '2026-06-01T06:00:00.000Z', priceCents: 1200,
    }];
    mocks.selfPurchaseItemIds = ['cart-item-1'];
    const Component = (Route as unknown as { component: ComponentType }).component;

    renderCart(<Component />);

    expect(screen.getByRole('dialog', { name: 'Remove your own items' })).toBeVisible();
    expect(screen.getByText(
      'You cannot purchase media you uploaded. Remove these items from your cart to continue.',
    )).toBeVisible();
    expect(screen.queryByTestId('cart-payment-lock')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove my items' }));

    expect(mocks.removeSelfPurchaseItems).toHaveBeenCalledTimes(1);
  });
});
