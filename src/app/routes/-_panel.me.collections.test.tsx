import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { render } from 'test/setup/render';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { Route } from './_panel.me.collections';

const mocks = vi.hoisted(() => ({
  activeTab: 'uploads' as string,
  sizeBand: 'wide' as 'compact' | 'constrained' | 'wide',
  heightBand: 'regular' as 'short' | 'regular',
  sessions: [
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
  ],
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
    useQuery: () => ({
      data: mocks.sessions,
      isLoading: false,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    sessions: {
      mine: {
        queryOptions: () => ({}),
      },
    },
    media: {
      favorites: {
        queryOptions: () => ({}),
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

  return render(
    <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
      <PanelLayout>
        <Component />
      </PanelLayout>
    </AppShellLayoutPolicyProvider>,
  );
}

describe('CollectionsLayout', () => {
  afterEach(() => {
    mocks.activeTab = 'uploads';
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
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
});
