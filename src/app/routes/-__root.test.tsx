import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { Route } from './__root';

const mocks = vi.hoisted(() => ({
  userId: 'user-a' as string | null,
  isLoading: false,
}));

vi.mock('@tanstack/react-router', () => ({
  createRootRouteWithContext: () => (options: Record<string, unknown>) => options,
  Outlet: () => <div data-testid="route-outlet" />,
  useMatches: () => [],
  useNavigate: () => vi.fn(),
}));

vi.mock('app/AppShell', () => ({
  AppShell: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('features/Auth', () => ({
  AuthModalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('features/AddSpot', () => ({
  AddSpotProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAddSpotStore: (selector: (state: { isActive: boolean }) => unknown) => selector({ isActive: false }),
}));

vi.mock('features/Cart', () => ({
  useCartSessionSync: () => undefined,
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({
    user: mocks.userId ? { id: mocks.userId } : null,
    isAuthenticated: mocks.userId !== null,
    isLoading: mocks.isLoading,
  }),
}));

vi.mock('shared/model/appShellPresentation', () => ({
  AppShellLayoutPolicyProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('shared/model/panelExpansionStore', () => ({
  usePanelExpansionStore: (selector: (state: {
    browsingExpanded: boolean;
    galleryExpanded: boolean;
    setBrowsingPanelExpanded: () => void;
    setGalleryPanelExpanded: () => void;
  }) => unknown) => selector({
    browsingExpanded: false,
    galleryExpanded: false,
    setBrowsingPanelExpanded: vi.fn(),
    setGalleryPanelExpanded: vi.fn(),
  }),
}));

vi.mock('shared/ui/DrawerShell', () => ({
  BrowseSurfaceProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderRoot(queryClient: QueryClient) {
  const Component = (Route as unknown as { component: ComponentType }).component;
  const renderUi = () => (
    <QueryClientProvider client={queryClient}>
      <Component />
    </QueryClientProvider>
  );
  const view = render(renderUi());
  return { ...view, rerenderRoot: () => view.rerender(renderUi()) };
}

describe('Root authentication cache lifecycle', () => {
  beforeEach(() => {
    mocks.userId = 'user-a';
    mocks.isLoading = false;
  });

  it('clears cached projections whenever the resolved authenticated identity changes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const workspaceKey = ['uploads', 'getActiveWorkspace'];
    queryClient.setQueryData(workspaceKey, { id: 'workspace-a', kind: 'NEW_SESSION' });
    const { rerenderRoot } = renderRoot(queryClient);

    expect(queryClient.getQueryData(workspaceKey)).toEqual({
      id: 'workspace-a',
      kind: 'NEW_SESSION',
    });

    mocks.userId = null;
    rerenderRoot();

    await waitFor(() => expect(queryClient.getQueryData(workspaceKey)).toBeUndefined());

    queryClient.setQueryData(workspaceKey, { id: 'anonymous-stale-workspace' });
    mocks.userId = 'user-b';
    rerenderRoot();

    await waitFor(() => expect(queryClient.getQueryData(workspaceKey)).toBeUndefined());
  });
});
