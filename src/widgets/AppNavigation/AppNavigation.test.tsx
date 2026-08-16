import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import type { BrowseSheetNavigationPlacement } from 'shared/ui/DrawerShell';
import { getNavigationRailGeometrySnapshot } from 'shared/model/navigationRailGeometry';
import { AppNavigation, AppNavigationFloating, AppNavigationSupplement } from './AppNavigation';

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
  CartControl: () => <button type="button" data-testid="cart-control">Cart</button>,
}));

vi.mock('./MenuControl', () => ({
  MenuControl: () => <button type="button" data-testid="menu-control">Menu</button>,
}));

describe('AppNavigation', () => {
  it('omits the cart button entirely when the cart is empty, so the stack shrinks around it', () => {
    mocks.isAuthenticated = false;
    mocks.count = 0;

    render(<AppNavigation presentation="leftStrip" drawerPresentation="persistent" />);

    expect(screen.queryByTestId('cart-control')).not.toBeInTheDocument();
  });

  it.each(['leftStrip', 'topBar', 'compactRail', 'compactBar'] as const)(
    'reaches the menu and cart destinations from a single set of controls in the %s presentation',
    (presentation) => {
      mocks.isAuthenticated = true;
      mocks.count = 1;

      render(<AppNavigation presentation={presentation} drawerPresentation="persistent" />);

      expect(screen.getByTestId('menu-control')).toBeInTheDocument();
      expect(screen.getAllByTestId('cart-control')).toHaveLength(1);
    },
  );

  it('keeps Menu before Cart in the constrained horizontal bar keyboard order', async () => {
    const user = userEvent.setup();

    render(<AppNavigation presentation="compactBar" drawerPresentation="sideOverlay" />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Cart' })).toHaveFocus();
  });

  it('renders neither control when the presentation is hidden', () => {
    mocks.isAuthenticated = true;
    mocks.count = 1;

    render(<AppNavigation presentation="hidden" drawerPresentation="hidden" />);

    expect(screen.queryByTestId('menu-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-control')).not.toBeInTheDocument();
  });

  it('marks the rail with the live drawer presentation, so presentation-specific CSS rules can key off it', () => {
    render(<AppNavigation presentation="compactRail" drawerPresentation="sideWorkspace" />);

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).toHaveAttribute('data-drawer-presentation', 'sideWorkspace');
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

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).not.toHaveAttribute('inert');
    expect(root).not.toHaveAttribute('aria-hidden');
  });

  it('marks the plate inert and aria-hidden once the placement reports hidden', () => {
    renderWithPlacement({ topPx: 0, opacity: 0, hidden: true, live: false });

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).toHaveAttribute('inert');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });

  it('marks the plate as live-tracking while the sheet is being dragged', () => {
    renderWithPlacement({ topPx: 200, opacity: 1, hidden: false, live: true });

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).toHaveAttribute('data-navigation-tracking');
  });

  it('omits the live-tracking attribute when the placement is at rest', () => {
    renderWithPlacement({ topPx: 200, opacity: 1, hidden: false, live: false });

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).not.toHaveAttribute('data-navigation-tracking');
  });
});

describe('NavigationSurface rail geometry', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes its own measured rail box once mounted', () => {
    class ResizeObserverHarness implements ResizeObserver {
      observe() { }
      unobserve() { }
      disconnect() { }
    }
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverHarness);
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    mocks.isAuthenticated = true;
    mocks.count = 1;

    render(<AppNavigation presentation="leftStrip" drawerPresentation="persistent" />);

    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]') as HTMLElement;
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 60, height: 900 }),
    );

    act(() => queuedFrames.shift()?.(0));

    expect(getNavigationRailGeometrySnapshot()).toEqual({
      left: 0, top: 0, right: 60, bottom: 900, width: 60, height: 900,
    });
  });
});

describe('AppNavigationSupplement', () => {
  it('renders nothing when mounted without an AppNavigation ancestor', () => {
    render(
      <AppNavigationSupplement>
        <button>Uploads</button>
      </AppNavigationSupplement>,
    );

    expect(screen.queryByRole('button', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('portals content into the rail below the menu/cart buttons when rendered as a sibling, matching the real composition root', () => {
    // AppShell and the routed Outlet are mounted as siblings of each other at
    // the composition root (__root.tsx), never nested — this reproduces that
    // shape rather than nesting AppNavigationSupplement inside AppNavigation's
    // own subtree, which would pass even if the portal target could only be
    // reached from inside AppNavigation's own tree.
    render(
      <>
        <AppNavigation presentation="leftStrip" drawerPresentation="persistent" />
        <AppNavigationSupplement>
          <button>Uploads</button>
        </AppNavigationSupplement>
      </>,
    );

    const button = screen.getByRole('button', { name: 'Uploads' });
    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]') as HTMLElement;
    expect(root).toContainElement(button);

    // DOCUMENT_POSITION_FOLLOWING: the portaled button comes after the cart
    // control in tree order, i.e. it renders below the menu/cart buttons
    // rather than above or interleaved between them.
    const cartControl = screen.getByTestId('cart-control');
    expect(cartControl.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});

describe('AppNavigationFloating', () => {
  it('renders nothing when mounted without an AppNavigation ancestor', () => {
    render(
      <AppNavigationFloating>
        <button>Uploads</button>
      </AppNavigationFloating>,
    );

    expect(screen.queryByRole('button', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('still portals content when the rail itself is hidden (portrait mobile on a non-browse route)', () => {
    // The regression this covers: the rail's own mount point used to live
    // inside the part of AppNavigation that returns null for a hidden
    // presentation, so a switcher meant to float independently of the rail
    // had nowhere to portal into on exactly the routes it needs to appear on.
    render(
      <>
        <AppNavigation presentation="hidden" drawerPresentation="fullScreen" />
        <AppNavigationFloating>
          <button>Uploads</button>
        </AppNavigationFloating>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Uploads' })).toBeInTheDocument();
    expect(screen.queryByTestId('menu-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cart-control')).not.toBeInTheDocument();
  });

  it('portals content beside the rail, not inside it, when the rail is visible', () => {
    render(
      <>
        <AppNavigation presentation="topBar" drawerPresentation="fullScreen" />
        <AppNavigationFloating>
          <button>Uploads</button>
        </AppNavigationFloating>
      </>,
    );

    const button = screen.getByRole('button', { name: 'Uploads' });
    const root = screen.getByTestId('menu-control').closest('[data-navigation-presentation]');
    expect(root).not.toContainElement(button);
  });
});
