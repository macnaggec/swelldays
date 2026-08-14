import { act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { AddSpotPanel } from './AddSpotPanel';
import { useAddSpotStore } from '../model/addSpotStore';

const mocks = vi.hoisted(() => ({
  sizeBand: 'wide' as 'compact' | 'constrained' | 'wide',
  heightBand: 'regular' as 'short' | 'regular',
  navigate: vi.fn(),
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

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isFetching: false }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    fetchQuery: vi.fn(),
  }),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    spots: {
      create: { mutationOptions: vi.fn(() => ({})) },
      nearby: { queryOptions: vi.fn(() => ({})) },
      list: { pathFilter: vi.fn(() => ({})) },
      withinBounds: { pathFilter: vi.fn(() => ({})) },
    },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: vi.fn() },
}));

// Mirrors -_panel.test.tsx's TestShellPolicyProvider: AddSpotPanel reads its
// presentation through useAppShellLayoutPolicy(), so tests rendering it directly must
// supply the provider the composition root (GlobeScene, mounted under __root.tsx) would
// otherwise mount, driven by this file's own controllable size/height band mocks.
function TestShellPolicyProvider({ children }: { children: ReactNode }) {
  return (
    <AppShellLayoutPolicyProvider
      routeIntent="immersiveMapInput"
      browseExpanded={false}
      galleryExpanded={true}
    >
      {children}
    </AppShellLayoutPolicyProvider>
  );
}

describe('AddSpotPanel', () => {
  beforeEach(() => {
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    // AddSpotPanel (unlike PanelFrame) reads the whole Add Spot store rather than a
    // primitive selector, so this reset always produces a new snapshot reference and
    // re-renders whatever instance from the just-finished test is still mounted —
    // RTL's own unmount runs after this hook. Wrapping it in act() keeps that
    // re-render inside a tracked act() scope instead of warning as an untracked update.
    act(() => {
      useAddSpotStore.getState().exit();
    });
  });

  it('renders the floating wide-band card, not a drawer surface, when the policy is hidden', () => {
    render(<TestShellPolicyProvider><AddSpotPanel /></TestShellPolicyProvider>);

    expect(screen.getByText('Click the globe to place a pin')).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Content drawer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Content drawer' })).not.toBeInTheDocument();
  });

  it('renders a bottom sheet at compact/regular', () => {
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    render(<TestShellPolicyProvider><AddSpotPanel /></TestShellPolicyProvider>);

    expect(screen.getByRole('complementary', { name: 'Content drawer' }))
      .toHaveAttribute('data-drawer-presentation', 'bottomSheet');
  });

  it.each([
    ['compact', 'short'],
    ['constrained', 'short'],
    ['constrained', 'regular'],
  ] as const)('renders a side overlay at %s/%s', (sizeBand, heightBand) => {
    mocks.sizeBand = sizeBand;
    mocks.heightBand = heightBand;
    render(<TestShellPolicyProvider><AddSpotPanel /></TestShellPolicyProvider>);

    expect(screen.getByRole('complementary', { name: 'Content drawer' }))
      .toHaveAttribute('data-drawer-presentation', 'sideOverlay');
  });

  it('raises the sheet to full once the pin is placed and the form step needs room for the keyboard', () => {
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    render(<TestShellPolicyProvider><AddSpotPanel /></TestShellPolicyProvider>);

    expect(screen.getByRole('complementary', { name: 'Content drawer' }))
      .toHaveAttribute('data-drawer-snap', 'half');

    act(() => {
      useAddSpotStore.getState().setTempPin([1, 2]);
    });

    expect(screen.getByRole('complementary', { name: 'Content drawer' }))
      .toHaveAttribute('data-drawer-snap', 'full');
  });

  it('mounts the step content as the sheet\'s registered scroll owner without throwing', () => {
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    render(<TestShellPolicyProvider><AddSpotPanel /></TestShellPolicyProvider>);

    const sheet = screen.getByRole('complementary', { name: 'Content drawer' });
    expect(sheet).toContainElement(screen.getByText('Click the globe to place a pin'));
  });
});
