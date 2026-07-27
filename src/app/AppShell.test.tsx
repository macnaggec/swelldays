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

vi.mock('widgets/LeftStrip', () => ({
  LeftStrip: () => <div data-testid="left-strip" />,
}));

describe('AppShell Add Spot chrome', () => {
  beforeEach(() => {
    useAddSpotStore.getState().exit();
    mocks.matches = [];
  });

  afterEach(() => {
    useAddSpotStore.getState().exit();
  });

  it('hides the left chrome throughout the add-spot flow', () => {
    const { unmount } = renderAppShell();
    expect(screen.getByTestId('left-strip')).toBeInTheDocument();
    unmount();

    act(() => {
      useAddSpotStore.getState().enter('New Spot');
      useAddSpotStore.getState().setTempPin([1, 2]);
    });
    const hidden = renderAppShell();

    expect(screen.getByTestId('globe-scene')).toBeInTheDocument();
    expect(screen.queryByTestId('left-strip')).not.toBeInTheDocument();
    hidden.unmount();
  });

  it('unmounts the globe scene and hides the left chrome on full-page overlay routes (e.g. admin)', () => {
    mocks.matches = [
      { routeId: '/_page', staticData: { appRouteIntent: 'fullPage' } },
      { routeId: '/_page/admin' },
    ];

    renderAppShell();

    expect(screen.queryByTestId('globe-scene')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-strip')).not.toBeInTheDocument();
  });
});
