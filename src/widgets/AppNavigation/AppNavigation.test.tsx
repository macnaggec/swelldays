import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AppNavigation } from './AppNavigation';

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  count: 0,
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock('entities/Commerce', () => ({
  useCartStore: (selector: (state: { items: unknown[] }) => unknown) =>
    selector({ items: Array.from({ length: mocks.count }) }),
}));

vi.mock('./CartControl', () => ({
  CartControl: () => <div data-testid="cart-control" />,
}));

vi.mock('./UserControl', () => ({
  UserControl: () => <div data-testid="user-control" />,
}));

describe('AppNavigation', () => {
  it('shows the cart control for an anonymous user when the cart has items', () => {
    mocks.isAuthenticated = false;
    mocks.count = 2;

    render(<AppNavigation presentation="leftStrip" drawerPresentation="persistent" />);

    expect(screen.getByTestId('cart-control')).toBeInTheDocument();
  });

  it('hides the cart control when the cart is empty, regardless of auth', () => {
    mocks.isAuthenticated = false;
    mocks.count = 0;

    render(<AppNavigation presentation="leftStrip" drawerPresentation="persistent" />);

    expect(screen.queryByTestId('cart-control')).not.toBeInTheDocument();
  });

  it.each(['leftStrip', 'topBar', 'compactBar'] as const)(
    'reaches the account and cart destinations from a single set of controls in the %s presentation',
    (presentation) => {
      mocks.isAuthenticated = true;
      mocks.count = 1;

      render(<AppNavigation presentation={presentation} drawerPresentation="persistent" />);

      expect(screen.getByTestId('user-control')).toBeInTheDocument();
      expect(screen.getAllByTestId('cart-control')).toHaveLength(1);
    },
  );

  it('renders neither control when the presentation is hidden', () => {
    mocks.isAuthenticated = true;
    mocks.count = 1;

    render(<AppNavigation presentation="hidden" drawerPresentation="hidden" />);

    expect(screen.queryByTestId('user-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-control')).not.toBeInTheDocument();
  });
});
