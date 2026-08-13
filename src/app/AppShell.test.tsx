import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAddSpotStore } from 'features/AddSpot';
import type { AppRouteIntent, DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({
  matches: [] as Array<{ routeId: string; staticData?: { appRouteIntent?: DeclaredAppRouteIntent } }>,
}));

vi.mock('@tanstack/react-router', () => ({
  useMatches: () => mocks.matches,
}));

function renderAppShell() {
  const routeIntent: AppRouteIntent = resolveAppRouteIntent(
    mocks.matches,
    useAddSpotStore.getState().isActive ? 'immersiveMapInput' : undefined,
  );

  return render(
    <AppShellLayoutPolicyProvider
      routeIntent={routeIntent}
      browseExpanded={false}
      galleryExpanded={false}
    >
      <AppShell />
    </AppShellLayoutPolicyProvider>,
  );
}

vi.mock('views/GlobeScene', () => ({
  GlobeScene: () => <div data-testid="globe-scene" />,
}));

vi.mock('widgets/AppNavigation', () => ({
  AppNavigation: ({ presentation }: { presentation: string; drawerPresentation: string }) => (
    presentation === 'hidden' ? null : <div data-testid="app-navigation" />
  ),
}));

describe('AppShell navigation chrome', () => {
  beforeEach(() => {
    useAddSpotStore.getState().exit();
    mocks.matches = [];
  });

  afterEach(() => {
    useAddSpotStore.getState().exit();
  });

  it('hides the navigation chrome throughout the add-spot flow', () => {
    const { unmount } = renderAppShell();
    expect(screen.getByTestId('app-navigation')).toBeInTheDocument();
    unmount();

    act(() => {
      useAddSpotStore.getState().enter('New Spot');
      useAddSpotStore.getState().setTempPin([1, 2]);
    });
    const hidden = renderAppShell();

    expect(screen.getByTestId('globe-scene')).toBeInTheDocument();
    expect(screen.queryByTestId('app-navigation')).not.toBeInTheDocument();
    hidden.unmount();
  });

  it('unmounts the globe scene and hides the navigation chrome on full-page overlay routes (e.g. admin)', () => {
    mocks.matches = [
      { routeId: '/_page', staticData: { appRouteIntent: 'fullPage' } },
      { routeId: '/_page/admin' },
    ];

    renderAppShell();

    expect(screen.queryByTestId('globe-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-navigation')).not.toBeInTheDocument();
  });

  it('publishes browser presentation on the application root', () => {
    const { container } = renderAppShell();

    expect(container.querySelector('[data-app-display-mode]'))
      .toHaveAttribute('data-app-display-mode', 'browser');
  });

  it('publishes standalone presentation from the same viewport capability used by sheet geometry', () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { container } = renderAppShell();

    expect(container.querySelector('[data-app-display-mode]'))
      .toHaveAttribute('data-app-display-mode', 'standalone');
  });

  it('keeps routed surfaces inside the display-mode root so they inherit its layout tokens', () => {
    const { container } = render(
      <AppShellLayoutPolicyProvider
        routeIntent="browse"
        browseExpanded={false}
        galleryExpanded={false}
      >
        <AppShell>
          <aside data-testid="routed-surface" />
        </AppShell>
      </AppShellLayoutPolicyProvider>,
    );

    expect(screen.getByTestId('routed-surface').closest('[data-app-display-mode]'))
      .toBe(container.querySelector('[data-app-display-mode]'));
  });
});
