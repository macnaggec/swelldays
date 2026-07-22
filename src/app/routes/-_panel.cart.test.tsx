import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { PanelLayout } from 'shared/ui/PanelLayout';
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
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('entities/Commerce', () => ({
  useCartStore: (selector: (state: { items: typeof mocks.items; remove: typeof mocks.remove }) => unknown) => selector({
    items: mocks.items,
    remove: mocks.remove,
  }),
  useCartCheckout: () => ({
    handleCheckout: mocks.handleCheckout,
    isPending: false,
    totalCents: 1200,
  }),
}));

vi.mock('features/Cart', () => ({
  CartCard: ({ item }: { item: { label: string } }) => <article>{item.label}</article>,
  CartLightbox: () => null,
  CheckoutButton: () => <button type="button">Checkout</button>,
}));

describe('CartPanelRoute', () => {
  it('renders the cart gallery inside the shared panel gallery inset', () => {
    mocks.items = [];
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<PanelLayout><Component /></PanelLayout>);

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

    render(<PanelLayout><Component /></PanelLayout>);

    expect(screen.getByRole('button', { name: 'Checkout' }).closest('[data-panel-layout-footer]')).not.toBeNull();
  });
});
