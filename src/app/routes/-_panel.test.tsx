import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAddSpotStore } from 'features/AddSpot';
import type { BrowseDateFilter } from 'shared/model/browseFilters';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { resolveAppRouteIntent, type DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { BrowseSurfaceProvider } from 'shared/ui/DrawerShell';
import { Route, usePanelFeedLayoutReadyChange, useSetPanelRouteBackAction } from './_panel';

// Mirrors the two-input derivation __root.tsx performs for the real app: PanelFrame
// no longer assembles policy inputs itself, so tests rendering it directly must supply
// the provider the composition root would otherwise mount. A real component (rather
// than a plain snapshot) so it stays subscribed to store updates the tests trigger by
// clicking expand/collapse controls, matching how RootLayout stays live in the app.
function TestShellPolicyProvider({ children }: { children: ReactNode }) {
  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const browseExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const galleryExpanded = usePanelExpansionStore((state) => state.galleryExpanded);
  const setBrowseExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const routeIntent = resolveAppRouteIntent(
    mocks.matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const sheetPreferredExpanded = routeIntent === 'galleryWorkspace'
    ? galleryExpanded
    : browseExpanded;
  const setSheetPreferredExpanded = routeIntent === 'galleryWorkspace'
    ? setGalleryExpanded
    : setBrowseExpanded;

  return (
    <AppShellLayoutPolicyProvider
      routeIntent={routeIntent}
      browseExpanded={browseExpanded}
      galleryExpanded={galleryExpanded}
    >
      <BrowseSurfaceProvider
        preferredExpanded={sheetPreferredExpanded}
        onPreferredExpandedChange={setSheetPreferredExpanded}
      >
        {children}
      </BrowseSurfaceProvider>
    </AppShellLayoutPolicyProvider>
  );
}

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notifyError: vi.fn(),
  openAuth: vi.fn(),
  startAddSpot: vi.fn(),
  isAuthenticated: false,
  historyBack: vi.fn(),
  uploadBack: vi.fn(),
  canGoBack: true,
  activeWorkspace: null as null | { id: string; kind: 'NEW_SESSION' | 'SESSION_EDIT' },
  matches: [{ routeId: '/_panel/', staticData: {} }] as Array<{
    routeId: string;
    staticData: { panelHeader?: string; appRouteIntent?: DeclaredAppRouteIntent };
    loaderData?: unknown;
    search?: unknown;
  }>,
  params: {} as { spotId?: string },
  sizeBand: 'wide' as 'compact' | 'constrained' | 'wide',
  heightBand: 'regular' as 'short' | 'regular',
  renderRealFeedSearch: false,
  spotResults: [{
    id: 'spot-b',
    name: 'Spot B',
    location: 'Somewhere',
    coords: [1, 2],
  }],
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

function FeedLayoutReadyProbe() {
  const reportLayoutReadyChange = usePanelFeedLayoutReadyChange();
  return <button onClick={() => reportLayoutReadyChange(true)}>Report feed layout ready</button>;
}

function UploadRouteBackActionProbe() {
  const setPanelRouteBackAction = useSetPanelRouteBackAction();

  useEffect(() => {
    // Chevron-only back action: the upload route registers no label.
    setPanelRouteBackAction({ onBack: mocks.uploadBack, disabled: false });
    return () => setPanelRouteBackAction(null);
  }, [setPanelRouteBackAction]);

  return <FeedLayoutReadyProbe />;
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Outlet: () => (
    mocks.matches.some((match) => match.routeId === '/_panel/upload')
      ? <UploadRouteBackActionProbe />
      : mocks.matches.some((match) => match.routeId === '/_panel/gallery')
      ? <div data-testid="public-gallery" data-spot-id="all" />
      : <FeedLayoutReadyProbe />
  ),
  useMatches: () => mocks.matches,
  useNavigate: () => mocks.navigate,
  useParams: () => mocks.params,
  useRouter: () => ({ history: { back: mocks.historyBack, canGoBack: () => mocks.canGoBack } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.activeWorkspace }),
}));

vi.mock('entities/Spot', () => ({
  useSelectedSpot: () => ({
    spot: mocks.params.spotId ? { id: mocks.params.spotId, name: 'Spot A', location: 'Somewhere' } : null,
  }),
  useSpotPreview: () => ({ data: null }),
  useSpots: () => ({ data: mocks.spotResults, isFetching: false }),
  useAddSpotAlias: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('entities/SurfSession', () => ({}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated, isLoading: false, user: null }),
}));

vi.mock('features/Auth', () => ({
  useAuthModal: () => ({ open: mocks.openAuth }),
}));

vi.mock('features/AddSpot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('features/AddSpot')>();
  return {
    ...actual,
    useAddSpot: () => ({ startAddSpot: mocks.startAddSpot }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: { getActiveWorkspace: { queryOptions: vi.fn() } },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

vi.mock('entities/Commerce', () => ({
  useCartStore: () => [],
}));

vi.mock('widgets/SidePanel', () => ({
  SidePanel: ({
    expanded,
    onExpandToggle,
    onBack,
    backLabel,
    backDisabled,
    header,
    headerFullWidth,
    subheader,
    bottomBar,
    open,
    sheetSnap,
    onSheetSnapChange,
    children,
  }: {
    expanded?: boolean;
    onExpandToggle?: () => void;
    onBack?: () => void;
    backLabel?: string;
    backDisabled?: boolean;
    header?: ReactNode;
    headerFullWidth?: boolean;
    subheader?: ReactNode;
    bottomBar?: ReactNode;
    open?: boolean;
    sheetSnap?: 'peek' | 'half' | 'full';
    onSheetSnapChange?: (snap: 'peek' | 'half' | 'full') => void;
    children?: ReactNode;
  }) => (
    <>
    <div
      data-testid="side-panel"
      role="complementary"
      aria-label="Content drawer"
      aria-hidden={open === false || undefined}
      data-expanded={expanded ? 'true' : 'false'}
      data-has-back={onBack ? 'true' : 'false'}
      data-back-disabled={backDisabled ? 'true' : 'false'}
      data-header-full-width={headerFullWidth ? 'true' : 'false'}
      data-sheet-snap={sheetSnap ?? 'none'}
    >
      {onSheetSnapChange && (['peek', 'half', 'full'] as const).map((snap) => (
        <button key={snap} onClick={() => onSheetSnapChange(snap)}>{`Land on ${snap}`}</button>
      ))}
      {onExpandToggle && (
        <button
          aria-label={expanded ? 'Collapse panel' : 'Expand panel'}
          onClick={onExpandToggle}
        />
      )}
      {onBack && <button onClick={onBack} disabled={backDisabled}>{backLabel ?? 'Back'}</button>}
      {header}
      {subheader}
      {children}
    </div>
      {bottomBar}
    </>
  ),
  ScopeSwitcher: ({
    scope,
    onChange,
  }: {
    scope: 'sessions' | 'gallery';
    onChange: (scope: 'sessions' | 'gallery') => void;
  }) => (
    <div role="group" aria-label="Content scope">
      <button
        aria-pressed={scope === 'sessions'}
        onClick={scope === 'sessions' ? undefined : () => onChange('sessions')}
      >
        Feed
      </button>
      <button
        aria-pressed={scope === 'gallery'}
        onClick={scope === 'gallery' ? undefined : () => onChange('gallery')}
      >
        Gallery
      </button>
    </div>
  ),
  FilterPills: ({
    active,
    onChange,
    favoritesOnly,
    onFavoritesChange,
  }: {
    active: BrowseDateFilter;
    onChange: (value: BrowseDateFilter) => void;
    favoritesOnly?: boolean;
    onFavoritesChange?: (value: boolean) => void;
  }) => (
    <div role="group" aria-label="Browse filters">
      <button
        aria-pressed={active === 'today'}
        onClick={() => onChange(active === 'today' ? null : 'today')}
      >
        Today
      </button>
      <button
        aria-pressed={active === 'yesterday'}
        onClick={() => onChange(active === 'yesterday' ? null : 'yesterday')}
      >
        Yesterday
      </button>
      <button
        aria-pressed={active === 'last7'}
        onClick={() => onChange(active === 'last7' ? null : 'last7')}
      >
        Last 7 Days
      </button>
      <button
        aria-pressed={active !== null && typeof active === 'object'}
        onClick={() => onChange({ date: new Date('2026-07-18T12:00:00.000Z') })}
      >
        Date
      </button>
      {onFavoritesChange && (
        <button
          aria-label="Favorites"
          aria-pressed={favoritesOnly}
          onClick={() => onFavoritesChange(!favoritesOnly)}
        >
          Favorites
        </button>
      )}
    </div>
  ),
  SessionFeed: ({
    spotId,
    onSessionClick,
  }: {
    spotId?: string;
    onSessionClick?: (session: { id: string; spotId: string }) => void;
  }) => (
    <div data-testid="session-feed" data-spot-id={spotId ?? 'all'}>
      {onSessionClick && (
        <button onClick={() => onSessionClick({ id: 'session-1', spotId: 'spot-c' })}>
          Open session-1
        </button>
      )}
    </div>
  ),
}));

vi.mock('features/PublicGallery', () => ({
  PublicGallery: ({ spotId }: { spotId?: string }) => (
    <div data-testid="public-gallery" data-spot-id={spotId ?? 'all'} />
  ),
}));

vi.mock('widgets/FeedDrawer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('widgets/FeedDrawer')>();

  return {
    ...actual,
    FeedSearch: ({
      activeSpot,
      onSpotSelect,
      onClear,
    }: {
      activeSpot?: { id: string; name: string; location: string } | null;
      onSpotSelect?: (spot: { id: string }) => void;
      onClear?: () => void;
    }) => (
      mocks.renderRealFeedSearch ? (
        <actual.FeedSearch
          activeSpot={activeSpot}
          onSpotSelect={onSpotSelect}
          onClear={onClear}
        />
      ) : (
        <div data-testid="feed-search" data-active-spot={activeSpot?.id ?? 'none'}>
          {onClear && <button onClick={onClear}>Clear spot search</button>}
          {onSpotSelect && (
            <button onClick={() => onSpotSelect({ id: 'spot-b' })}>Select spot-b</button>
          )}
        </div>
      )
    ),
  };
});
vi.mock('features/Cart', () => ({
  CartDrawerHeader: ({
    spotName,
    onBack,
  }: {
    spotName?: string;
    onBack?: () => void;
  }) => (onBack ? <button onClick={onBack}>{spotName ?? 'Back to feed'}</button> : null),
}));

describe('Panel upload entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = false;
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    mocks.canGoBack = true;
    mocks.activeWorkspace = null;
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: true });
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    useAddSpotStore.getState().exit();
    vi.unstubAllGlobals();
  });

  it('opens authentication instead of navigating to upload for an anonymous visitor', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.openAuth).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('carries the visitor through to upload once they sign in', () => {
    mocks.params = { spotId: 'spot-current' };
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    const { onAuthenticated } = mocks.openAuth.mock.calls[0]?.[0] as { onAuthenticated: () => void };
    expect(mocks.navigate).not.toHaveBeenCalled();

    act(() => {
      onAuthenticated();
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-current' },
    });
  });

  it('navigates straight to /upload carrying the current spot, without creating a draft', () => {
    mocks.isAuthenticated = true;
    mocks.params = { spotId: 'spot-current' };
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-current' },
    });
  });

  it('navigates to /upload with no spot when none is currently selected', () => {
    mocks.isAuthenticated = true;
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: undefined },
    });
  });

  it('does not show the panel minimize control on the cart route', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'siteWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();
  });

  it('uses the user preference while browsing normal panel routes', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });

    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
  });

  it('updates the user preference when the photographer toggles expand and collapse', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    });
  });

  it('compacts expanded browsing when the shared map action changes its preference', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    await waitFor(() => expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'true'));

    act(() => usePanelExpansionStore.getState().setBrowsingPanelExpanded(false));

    await waitFor(() => expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'false'));
  });

  it('opens the cart route in the full-size panel', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'siteWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
  });

  it('forces a route workspace open without overwriting browse or gallery preferences', () => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: false });
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'siteWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'true');
    expect(usePanelExpansionStore.getState()).toMatchObject({
      browsingExpanded: false,
      galleryExpanded: false,
    });
  });

  it('keeps gallery expanded by default while allowing an explicit compact toggle', async () => {
    mocks.matches = [{
      routeId: '/_panel/$spotId/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    });
    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument();
  });

  it('floats the filter pills over the map when the all-spots gallery is compact', () => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: false });
    mocks.matches = [{
      routeId: '/_panel/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('compacts expanded gallery when the shared map action changes its preference', async () => {
    mocks.matches = [{
      routeId: '/_panel/$spotId/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'true');

    act(() => usePanelExpansionStore.getState().setGalleryPanelExpanded(false));

    await waitFor(() => expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'false'));
  });

  it('keeps the panel compact when switching from compact feed to gallery', () => {
    let runNextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runNextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId/gallery',
      params: { spotId: 'spot-a' },
    });

    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });

  it('keeps the panel full-size when switching from full gallery to feed', () => {
    let runNextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runNextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-a' },
    });

    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));
    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    vi.unstubAllGlobals();
  });

  it('has no back navigation on the gallery route since the Feed/Gallery switcher already covers it', () => {
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-has-back')).toBe('false');
  });

  it('uses compact map-input behavior on the upload route, with a chevron-only back control', async () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-has-back')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(mocks.uploadBack).toHaveBeenCalledOnce();
  });

  it('titles the panel "Upload" for a new upload and "Edit session" for an edit workspace', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByText('Upload')).not.toBeNull();

    mocks.activeWorkspace = { id: 'workspace-1', kind: 'SESSION_EDIT' };
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByText('Edit session')).not.toBeNull();
  });

  it('compacts upload after expanded browsing even when feed layout is not ready', async () => {
    let runNextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runNextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    runNextFrame = undefined;
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });

  it('lets the cart header span the full panel width', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'siteWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-header-full-width')).toBe('true');
  });

  it('routes cart visitors without a spot origin back to the feed', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'siteWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Back to feed' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('sends a standalone-opened session detail to the feed instead of leaving the app', () => {
    mocks.canGoBack = false;
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Back to feed' }));

    expect(mocks.historyBack).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('uses in-app history to return from a session detail reached by browsing', () => {
    mocks.canGoBack = true;
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Back to feed' }));

    expect(mocks.historyBack).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalledWith({ to: '/' });
  });

  it('labels the back button for a session detail reached from the uploads list', () => {
    mocks.canGoBack = false;
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
      search: { from: 'collections' },
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Back to uploads' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/collections' });
  });

  it('restores the compact feed preference after visiting a forced full-size route', () => {
    let runNextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runNextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    expect(runNextFrame).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });

  it('restores the compact gallery preference after visiting a forced full-size route', async () => {
    let runNextFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      runNextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');

    runNextFrame = undefined;
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
    }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    runNextFrame = undefined;
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });

  it('routes from a spot gallery to the all-spots gallery when clearing the search chip', () => {
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('feed-search').getAttribute('data-active-spot')).toBe('spot-a');

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/gallery',
    });
  });

  it('keeps a photographer in sessions mode when picking a new spot from the sessions view', () => {
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-b' },
    });
  });

  it('lets a photographer switch from all sessions to the all-spots gallery', () => {
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
  });

  it('routes clearing a selected gallery spot to the all-spots gallery', () => {
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('button', { name: 'Report feed layout ready' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
  });

  it('picks a new spot into the gallery route from the all-spots gallery', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    mocks.params = {};
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('public-gallery').getAttribute('data-spot-id')).toBe('all');

    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId/gallery',
      params: { spotId: 'spot-b' },
    });
  });

  it('shows all-spots gallery expanded until the photographer explicitly compacts it', async () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    mocks.params = {};
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('public-gallery').getAttribute('data-spot-id')).toBe('all');
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    });
    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument();
  });

  it('restores real filtered gallery content after a new spot is picked', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    mocks.params = {};
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    expect(screen.queryByRole('button', { name: 'Report feed layout ready' })).not.toBeInTheDocument();

    // Picking a new spot restores real, unfiltered-by-the-old-spot content.
    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));
    mocks.params = { spotId: 'spot-b' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('button', { name: 'Report feed layout ready' })).toBeInTheDocument();
    expect(screen.queryByTestId('public-gallery')).not.toBeInTheDocument();
  });

  it('keeps the gallery expanded after clearing the selected spot', () => {
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    // While a spot is selected, gallery is a dedicated workspace: expanded with an explicit fold control.
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Collapse panel' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
  });

  it('routes clearing a selected feed spot to the all-sessions feed', () => {
    mocks.params = { spotId: 'spot-a' };
    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('hides the side panel throughout the add-spot flow, and restores once the flow exits', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });

    act(() => {
      useAddSpotStore.getState().enter('New Spot');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();

    act(() => {
      useAddSpotStore.getState().setTempPin([1, 2]);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });

    act(() => {
      useAddSpotStore.getState().exit();
    });

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });
  });

  it('restores the panel when Add Spot is cancelled before a point is picked', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });

    act(() => {
      useAddSpotStore.getState().enter('New Spot');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });

    act(() => {
      useAddSpotStore.getState().exit();
    });

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });
  });
});

describe('Panel favorites filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = false;
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    mocks.activeWorkspace = null;
  });

  it('prompts for authentication without activating the filter when signed out', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    const favorites = screen.getByRole('button', { name: 'Favorites' });
    fireEvent.click(favorites);

    expect(mocks.openAuth).toHaveBeenCalledTimes(1);
    expect(favorites).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies the filter the visitor asked for once they sign in', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    const favorites = screen.getByRole('button', { name: 'Favorites' });
    fireEvent.click(favorites);

    const { onAuthenticated } = mocks.openAuth.mock.calls[0]?.[0] as { onAuthenticated: () => void };
    expect(favorites).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      onAuthenticated();
    });

    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the favorite-spots filter available and active after switching to gallery', () => {
    mocks.isAuthenticated = true;
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('Panel compact browse sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    mocks.renderRealFeedSearch = false;
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: true });
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    mocks.renderRealFeedSearch = false;
    useAddSpotStore.getState().exit();
  });

  it('opens the browse sheet at the position the stored preference asks for', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'half');
  });

  it('returns to the map from the bottom section bar by lowering the sheet to peek', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'peek');
    expect(screen.queryByRole('navigation', { name: 'Browse sections' })).not.toBeInTheDocument();
  });

  it('moves Feed and Gallery navigation out of the compact sheet header', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('navigation', { name: 'Browse sections' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Content scope' })).not.toBeInTheDocument();
  });

  it('opens Gallery from the compact bottom section bar', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
  });

  it('does not overwrite the Gallery preference when switching sections at the half snap', () => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: false });
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(usePanelExpansionStore.getState().galleryExpanded).toBe(false);
  });

  it('keeps the same compact sheet and section bar after Gallery opens', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'half');
    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    mocks.matches = [{
      routeId: '/_panel/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'half');
    expect(screen.getByRole('navigation', { name: 'Browse sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('group', { name: 'Content scope' })).not.toBeInTheDocument();
  });

  it('preserves one shared filter selection across sheet, section, and mobile-shell changes', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Land on half' }));

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('group', { name: 'Browse filters' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));
    mocks.matches = [{
      routeId: '/_panel/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');

    mocks.sizeBand = 'constrained';
    mocks.heightBand = 'short';
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('group', { name: 'Browse filters' })).toHaveLength(1);
  });

  it('carries an expanded wide panel into the sheet when the window narrows to a phone', () => {
    mocks.sizeBand = 'wide';
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'none');
    // Expanded on the desktop panel *after* the page loaded, so the sheet cannot have
    // learned this from its opening position — it has to read the preference at the crossing.
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    mocks.sizeBand = 'compact';
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'full');
  });

  it('keeps a sheet raised to full as the expanded panel after the window widens again', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Land on full' }));
    mocks.sizeBand = 'wide';
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    // The wide browse panel holds its collapsed width until the feed reports its layout,
    // so the crossing shows the preference only once that arrives.
    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'true');
    });
  });

  it('resumes the sheet at the same snap after crossing out to wide and back to compact', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Land on full' }));
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'full');

    // Cross out: compact -> wide. The sheet itself stops rendering, but the persisted
    // expansion preference (written by 'Land on full' above) must survive the crossing.
    mocks.sizeBand = 'wide';
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'none');

    // Cross back in: wide -> compact. The sheet must resume at 'full', reseeded from the
    // same preference — not reset to the 'half' default a fresh mount would otherwise use.
    mocks.sizeBand = 'compact';
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'full');
  });

  it('lets a spot chosen from search open that spot while the sheet is above its smallest position', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$spotId', params: { spotId: 'spot-b' } });
  });

  it('opens a spot from the search-only sheet and raises its Feed results', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Land on peek' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$spotId', params: { spotId: 'spot-b' } });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'half');
  });

  it('keeps search results outside the clipped peek sheet while preserving keyboard selection', async () => {
    mocks.renderRealFeedSearch = true;
    const user = userEvent.setup();
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    await user.click(screen.getByRole('button', { name: 'Land on peek' }));
    const searchInput = screen.getByPlaceholderText('Search for a spot...');
    await user.click(searchInput);
    await user.type(searchInput, 'sp');

    const option = await screen.findByRole('option', { name: /Spot B/, hidden: true });
    expect(screen.getByTestId('side-panel')).not.toContainElement(option);

    Object.defineProperty(option, 'scrollIntoView', { value: vi.fn() });
    await user.keyboard('{ArrowDown}{Enter}');

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-b' },
    });
    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'half');
  });
});

describe('Panel compact upload sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    mocks.params = {};
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    usePanelExpansionStore.setState({ browsingExpanded: true, galleryExpanded: true });
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    useAddSpotStore.getState().exit();
  });

  it('opens the upload sheet at its own default position, independent of the browse sheet state', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'full');

    fireEvent.click(screen.getByRole('button', { name: 'Land on peek' }));

    expect(screen.getByTestId('side-panel')).toHaveAttribute('data-sheet-snap', 'peek');
    // Landing Upload's own sheet on peek must not write through Browse's persisted
    // expand preference: that preference belongs to useBrowseSurface(), not Upload's
    // own local snap state. If the two were wired together, this would flip false.
    expect(usePanelExpansionStore.getState().browsingExpanded).toBe(true);
  });
});

describe('Panel compact add-spot suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    mocks.sizeBand = 'compact';
    mocks.heightBand = 'regular';
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: true });
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    // The test below leaves Add Spot active when it finishes, and RTL's own unmount
    // runs after this hook — so this reset is a real true -> false flip landing on a
    // still-mounted tree. Wrapping it in act() keeps that inside a tracked act() scope.
    act(() => {
      useAddSpotStore.getState().exit();
    });
  });

  it('suppresses the side panel while Add Spot is active on a newly activated Phase M band', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByTestId('side-panel')).toBeInTheDocument();

    act(() => {
      useAddSpotStore.getState().enter('New Spot');
    });

    await waitFor(() => {
      expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument();
    });
  });
});

describe('Panel short-height browse section shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    mocks.params = {};
    mocks.sizeBand = 'constrained';
    mocks.heightBand = 'short';
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: false });
    useAddSpotStore.getState().exit();
  });

  afterEach(() => {
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    useAddSpotStore.getState().exit();
  });

  it('moves search and Upload to standalone Map chrome while keeping the results drawer mounted', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    const panel = screen.getByRole('complementary', { name: 'Content drawer' });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    expect(screen.getByRole('navigation', { name: 'Browse sections' })).toBeInTheDocument();
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    const mapSearch = screen.getByRole('search', { name: 'Map search' });
    expect(mapSearch).not.toBe(panel);
    expect(mapSearch).toContainElement(screen.getByTestId('feed-search'));
    expect(mapSearch).toContainElement(screen.getByRole('button', { name: 'Upload' }));
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Feed' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toBe(panel);
    expect(panel).not.toHaveAttribute('aria-hidden');
    expect(screen.queryByRole('search', { name: 'Map search' })).not.toBeInTheDocument();
    expect(panel).toContainElement(screen.getByTestId('feed-search'));
  });

  it('centers the section bar on the viewport in Map mode and avoids the results panel in Feed', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    const navigation = screen.getByRole('navigation', { name: 'Browse sections' });
    expect(navigation).toHaveAttribute('data-drawer-adjacent');

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));

    expect(screen.getByRole('navigation', { name: 'Browse sections' }))
      .not.toHaveAttribute('data-drawer-adjacent');
  });

  it('opens a searched spot in Feed from the short-height Map toolbar', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/$spotId', params: { spotId: 'spot-b' } });
    expect(screen.getByTestId('side-panel')).not.toHaveAttribute('aria-hidden');
  });

  it('reopens the panel for Gallery and keeps the short-height shell after its route becomes active', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    const panel = screen.getByRole('complementary', { name: 'Content drawer' });
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gallery' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toBe(panel);

    mocks.matches = [{
      routeId: '/_panel/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    rerender(<TestShellPolicyProvider><Component /></TestShellPolicyProvider>);

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toBe(panel);
    expect(screen.getByRole('button', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
  });
});
