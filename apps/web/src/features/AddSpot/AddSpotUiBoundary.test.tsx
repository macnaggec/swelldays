import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ElementType, ReactNode } from 'react';
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { useAddSpotStore } from './model/addSpotStore';

const lifecycle = vi.hoisted(() => ({
  moduleLoads: 0,
  mounts: 0,
  unmounts: 0,
}));

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock('shared/model/viewportCapabilities', () => ({
  useViewportCapabilities: () => ({
    sizeBand: 'compact',
    heightBand: 'regular',
    primaryPointer: 'coarse',
    supportsHover: false,
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

vi.mock('./ui/AddSpotPanel', async (importOriginal) => {
  lifecycle.moduleLoads += 1;
  const actual = await importOriginal<typeof import('./ui/AddSpotPanel')>();
  const { useEffect } = await import('react');

  return {
    ...actual,
    AddSpotPanel: function InstrumentedAddSpotPanel() {
      useEffect(() => {
        lifecycle.mounts += 1;
        return () => {
          lifecycle.unmounts += 1;
        };
      }, []);

      return <actual.AddSpotPanel />;
    },
  };
});

function isRenderableComponent(value: unknown): value is ElementType {
  return typeof value === 'function'
    || (typeof value === 'object' && value !== null && '$$typeof' in value);
}

function BoundaryHost({ Panel }: { Panel: ElementType }) {
  const isActive = useAddSpotStore((state) => state.isActive);

  return (
    <>
      <div role="application" aria-label="Globe map" />
      {isActive && (
        <Suspense fallback={null}>
          <Panel />
        </Suspense>
      )}
    </>
  );
}

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

describe('Add Spot UI boundary', () => {
  beforeEach(() => {
    lifecycle.moduleLoads = 0;
    lifecycle.mounts = 0;
    lifecycle.unmounts = 0;
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    act(() => {
      useAddSpotStore.getState().exit();
    });
  });

  it('loads the real workspace only while active without remounting the map', async () => {
    const user = userEvent.setup();
    const featureModule: {
      LazyAddSpotPanel?: unknown;
      AddSpotPanel?: unknown;
    } = await import('./index');
    const Panel = featureModule.LazyAddSpotPanel ?? featureModule.AddSpotPanel;

    if (!isRenderableComponent(Panel)) {
      throw new Error('Add Spot must expose a renderable UI boundary');
    }

    expect(lifecycle.moduleLoads).toBe(0);

    render(
      <TestShellPolicyProvider>
        <BoundaryHost Panel={Panel} />
      </TestShellPolicyProvider>,
    );
    const map = screen.getByRole('application', { name: 'Globe map' });

    act(() => {
      useAddSpotStore.getState().enter('Seeded break');
      useAddSpotStore.getState().setTempPin([151.2, -33.85]);
    });

    expect(await screen.findByRole('textbox', { name: 'Spot name' }))
      .toHaveValue('Seeded break');
    expect(lifecycle.moduleLoads).toBe(1);
    expect(lifecycle.mounts).toBe(1);
    expect(screen.getByRole('application', { name: 'Globe map' })).toBe(map);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Content drawer' }))
        .not.toBeInTheDocument();
    });
    expect(useAddSpotStore.getState().isActive).toBe(false);
    expect(lifecycle.unmounts).toBe(1);
    expect(screen.getByRole('application', { name: 'Globe map' })).toBe(map);
  });
});
