import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { render } from 'test/setup/render';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { Route } from './_panel.me.collections';

const INITIAL_SESSIONS = [
  {
    id: 'session-1',
    spotId: 'spot-1',
    photographerId: 'photographer-1',
    status: 'PUBLISHED',
    thumbnailUrl: null,
    startsAt: new Date('2026-06-01T06:00:00.000Z'),
    endsAt: new Date('2026-06-01T08:00:00.000Z'),
    createdAt: new Date('2026-06-01T05:00:00.000Z'),
    mediaCount: 2,
    spot: { id: 'spot-1', name: 'Pipeline', location: 'North Shore' },
    photographer: { id: 'photographer-1', name: 'Kai' },
  },
  {
    id: 'session-2',
    spotId: 'spot-2',
    photographerId: 'photographer-1',
    status: 'PUBLISHED',
    thumbnailUrl: null,
    startsAt: new Date('2026-06-02T06:00:00.000Z'),
    endsAt: new Date('2026-06-02T08:00:00.000Z'),
    createdAt: new Date('2026-06-02T05:00:00.000Z'),
    mediaCount: 3,
    spot: { id: 'spot-2', name: 'Uluwatu', location: 'Bali' },
    photographer: { id: 'photographer-1', name: 'Kai' },
  },
];

// Distinct spot IDs from INITIAL_SESSIONS on purpose: this is what lets the
// tab-switch test tell "the filter was cleared" apart from "the stale spot ID
// coincidentally still matched an option in the destination tab".
const INITIAL_FAVORITES = [
  {
    id: 'favorite-1',
    spot: { id: 'spot-3', name: 'Teahupoo', location: 'Tahiti' },
  },
  {
    id: 'favorite-2',
    spot: { id: 'spot-4', name: 'Jeffreys Bay', location: 'South Africa' },
  },
];

const mocks = vi.hoisted(() => ({
  activeTab: 'uploads' as string,
  sizeBand: 'wide' as 'compact' | 'constrained' | 'wide',
  heightBand: 'regular' as 'short' | 'regular',
  sessions: [] as Array<{ spot: { id: string; name: string } }>,
  favorites: [] as Array<{ spot: { id: string; name: string } }>,
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Outlet: () => <div data-testid="collections-outlet" />,
  useNavigate: () => vi.fn(),
  useRouterState: () => mocks.activeTab,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: (options: { queryKey?: unknown[] }) => ({
      data: options.queryKey?.[0] === 'favorites' ? mocks.favorites : mocks.sessions,
      isLoading: false,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    sessions: {
      mine: {
        queryOptions: () => ({ queryKey: ['sessions'] }),
      },
    },
    media: {
      favorites: {
        queryOptions: () => ({ queryKey: ['favorites'] }),
      },
    },
  }),
}));

vi.mock('shared/model/viewportCapabilities', () => ({
  useViewportCapabilities: () => ({
    sizeBand: mocks.sizeBand,
    heightBand: mocks.heightBand,
    primaryPointer: 'fine',
    supportsHover: true,
    prefersReducedMotion: false,
  }),
}));

function renderCollections() {
  const Component = (Route as unknown as { component: ComponentType }).component;
  // A fresh element on every call, not a captured/reused one: passing the
  // identical element reference to RTL's rerender() hits React's referential-
  // equality bailout and skips re-invoking the whole subtree, which would
  // silently stop these tests from ever observing a mocks.activeTab change.
  const buildUi = () => (
    <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
      <PanelLayout>
        <Component />
      </PanelLayout>
    </AppShellLayoutPolicyProvider>
  );
  const result = render(buildUi());

  return { ...result, rerenderCollections: () => result.rerender(buildUi()) };
}

describe('CollectionsLayout', () => {
  beforeEach(() => {
    mocks.activeTab = 'uploads';
    // Neither desktop (leftStrip) nor the landscape-phone side workspace: the
    // sticky-toolbar/floating-switcher path most of these tests exercise.
    // Desktop's own header-trailing/no-floating-switcher behavior is covered
    // separately below, since a bare-PanelLayout render has no real SidePanel
    // or AppNavigation for that placement to portal into.
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    mocks.sessions = INITIAL_SESSIONS;
    mocks.favorites = INITIAL_FAVORITES;
  });

  it('owns the collection outlet', () => {
    renderCollections();

    expect(screen.getByTestId('collections-outlet')).toBeInTheDocument();
  });

  it('places the upload spot filter in the sticky toolbar', () => {
    renderCollections();

    const toolbar = screen.getByTestId('collections-toolbar');
    expect(toolbar).not.toHaveAttribute('data-panel-scroll-hide');
    expect(toolbar.closest('[data-panel-scroll-chrome]')).not.toBeNull();
    expect(toolbar).toHaveAccessibleName('Filter uploads by spot');
  });

  it('does not render the tab switcher without a real AppNavigation to portal into', () => {
    renderCollections();

    // The switcher is an AppNavigationSupplement portal — proven at AppNavigation's own
    // boundary (AppNavigation.test.tsx), which is what actually owns that portal target;
    // this bare-PanelLayout render has no real AppNavigation to deliver into.
    expect(screen.queryByRole('navigation', { name: 'Collections sections' })).not.toBeInTheDocument();
  });

  it('also places a spot filter in the toolbar for the favorites tab', () => {
    mocks.activeTab = 'favorites';
    renderCollections();

    const toolbar = screen.getByTestId('collections-toolbar');
    expect(toolbar).toHaveAccessibleName('Filter favorites by spot');
  });

  it('stops rendering the spot filter in the sticky toolbar when the drawer is a side overlay beside the map', () => {
    mocks.sizeBand = 'constrained';
    mocks.heightBand = 'short';
    renderCollections();

    // The route hands the filter to SidePanel's header-trailing slot instead — proven at
    // SidePanel's own boundary (SidePanel.test.tsx), which is what actually owns that
    // portal target; this bare-PanelLayout render has no real SidePanel to deliver into.
    expect(screen.queryByTestId('collections-toolbar')).not.toBeInTheDocument();
  });

  it('stops rendering the spot filter in the sticky toolbar on desktop, where it docks into the header instead', () => {
    mocks.sizeBand = 'wide';
    renderCollections();

    // Same header-trailing hand-off as the side-overlay case above, just for the
    // desktop band — _panel.tsx renders the Uploads/Purchases/Favorites switcher
    // directly in that same header row in the real app.
    expect(screen.queryByTestId('collections-toolbar')).not.toBeInTheDocument();
  });

  it('does not mount the floating tab switcher on desktop, since the header carries it instead', () => {
    mocks.sizeBand = 'wide';
    renderCollections();

    expect(screen.queryByRole('navigation', { name: 'Collections sections' })).not.toBeInTheDocument();
  });

  it('clears the spot filter when the active tab changes, so a stale spot ID cannot carry into another collection', async () => {
    const { rerenderCollections } = renderCollections();

    const uploadsInput = screen.getByRole('textbox', { name: 'Filter uploads by spot' }) as HTMLInputElement;
    await userEvent.click(uploadsInput);
    fireEvent.click(screen.getByText('Pipeline'));
    expect(uploadsInput.value).toBe('Pipeline');

    mocks.activeTab = 'favorites';
    rerenderCollections();

    const favoritesInput = screen.getByRole('textbox', { name: 'Filter favorites by spot' }) as HTMLInputElement;
    expect(favoritesInput.value).toBe('');
  });

  it('rejects a selected spot filter that is no longer among its own tab options once the underlying data changes', async () => {
    const sessionWithSpot1 = INITIAL_SESSIONS[0];
    const sessionWithSpot2 = INITIAL_SESSIONS[1];
    if (!sessionWithSpot1 || !sessionWithSpot2) throw new Error('fixture sessions missing');
    mocks.sessions = [
      sessionWithSpot1,
      sessionWithSpot2,
      {
        ...sessionWithSpot2,
        id: 'session-3',
        spot: { id: 'spot-5', name: 'Mundaka', location: 'Spain' },
      },
    ];
    const { rerenderCollections } = renderCollections();

    const uploadsInput = screen.getByRole('textbox', { name: 'Filter uploads by spot' }) as HTMLInputElement;
    await userEvent.click(uploadsInput);
    fireEvent.click(screen.getByText('Pipeline'));
    expect(uploadsInput.value).toBe('Pipeline');

    // The spot-1 session is gone; spot-2 and spot-5 remain, so the toolbar
    // still has 2 options and stays visible, but the selected spot-1 filter
    // is no longer one of them.
    mocks.sessions = mocks.sessions.filter((session) => session.spot.id !== 'spot-1');
    rerenderCollections();

    expect(screen.getByTestId('collections-toolbar')).toBeInTheDocument();
    expect(uploadsInput.value).toBe('');
  });
});
