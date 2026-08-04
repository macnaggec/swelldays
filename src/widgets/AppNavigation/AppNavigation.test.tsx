import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import type { BrowseSheetNavigationPlacement } from 'shared/ui/DrawerShell';
import { AppNavigation } from './AppNavigation';

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  count: 0,
}));

const drawerShellMocks = vi.hoisted(() => ({
  useBrowseSurface: vi.fn(),
  useBrowseSheetNavigationPlacement: vi.fn(),
}));

vi.mock('shared/ui/DrawerShell', () => ({
  useBrowseSurface: drawerShellMocks.useBrowseSurface,
  useBrowseSheetNavigationPlacement: drawerShellMocks.useBrowseSheetNavigationPlacement,
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
  it('always reserves the cart button slot, regardless of cart count — CartControl itself decides whether to show content', () => {
    mocks.isAuthenticated = false;
    mocks.count = 0;

    render(<AppNavigation presentation="leftStrip" drawerPresentation="persistent" />);

    expect(screen.getByTestId('cart-control')).toBeInTheDocument();
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

describe('BrowseSheetNavigation placement', () => {
  const renderWithPlacement = (placement: BrowseSheetNavigationPlacement) => {
    drawerShellMocks.useBrowseSurface.mockReturnValue({
      mode: 'results',
      snap: 'half',
      setSnap: vi.fn(),
      showMap: vi.fn(),
      showResults: vi.fn(),
    });
    drawerShellMocks.useBrowseSheetNavigationPlacement.mockReturnValue(placement);

    render(<AppNavigation presentation="topBar" drawerPresentation="bottomSheet" />);
  };

  it('exposes no inert or aria-hidden attribute when the placement is visible', () => {
    renderWithPlacement({ topPx: 200, opacity: 1, hidden: false, live: false });

    const root = screen.getByTestId('user-control').closest('[data-navigation-presentation]');
    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-hidden');
  });

  it('marks the plate inert and aria-hidden once the placement reports hidden', () => {
    renderWithPlacement({ topPx: 0, opacity: 0, hidden: true, live: false });

    const root = screen.getByTestId('user-control').closest('[data-navigation-presentation]');
    expect(root).toHaveAttribute('inert');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the plate as live-tracking while the sheet is being dragged', () => {
    renderWithPlacement({ topPx: 200, opacity: 1, hidden: false, live: true });

    const root = screen.getByTestId('user-control').closest('[data-navigation-presentation]');
    expect(root).toHaveAttribute('data-navigation-tracking');
  });

  it('omits the live-tracking attribute when the placement is at rest', () => {
    renderWithPlacement({ topPx: 200, opacity: 1, hidden: false, live: false });

    const root = screen.getByTestId('user-control').closest('[data-navigation-presentation]');
    expect(root).not.toHaveAttribute('data-navigation-tracking');
  });
});
