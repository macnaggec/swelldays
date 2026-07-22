import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAddSpotStore } from 'features/AddSpot';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import type { DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';
import { Route, usePanelFeedLayoutReadyChange, useSetPanelRouteBackAction } from './_panel';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  notifyError: vi.fn(),
  openAuth: vi.fn(),
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
}));

vi.mock('entities/SurfSession', () => ({}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated, isLoading: false, user: null }),
}));

vi.mock('features/Auth', () => ({
  useAuthModal: () => ({ open: mocks.openAuth }),
}));

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
    children?: ReactNode;
  }) => (
    <div
      data-testid="side-panel"
      data-expanded={expanded ? 'true' : 'false'}
      data-has-back={onBack ? 'true' : 'false'}
      data-back-disabled={backDisabled ? 'true' : 'false'}
      data-header-full-width={headerFullWidth ? 'true' : 'false'}
    >
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
    favoritesOnly,
    onFavoritesChange,
  }: {
    favoritesOnly?: boolean;
    onFavoritesChange?: (value: boolean) => void;
  }) => onFavoritesChange ? (
    <button
      aria-label="Favorites"
      aria-pressed={favoritesOnly}
      onClick={() => onFavoritesChange?.(!favoritesOnly)}
    >
      Favorites
    </button>
  ) : null,
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

vi.mock('widgets/FeedDrawer', () => ({
  FeedSearch: ({
    activeSpot,
    onSpotSelect,
    onClear,
  }: {
    activeSpot?: { id: string } | null;
    onSpotSelect?: (spot: { id: string }) => void;
    onClear?: () => void;
  }) => (
    <div data-testid="feed-search" data-active-spot={activeSpot?.id ?? 'none'}>
      {onClear && <button onClick={onClear}>Clear spot search</button>}
      {onSpotSelect && (
        <button onClick={() => onSpotSelect({ id: 'spot-b' })}>Select spot-b</button>
      )}
    </div>
  ),
}));
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
    render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.openAuth).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('navigates straight to /upload carrying the current spot, without creating a draft', () => {
    mocks.isAuthenticated = true;
    mocks.params = { spotId: 'spot-current' };
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-current' },
    });
  });

  it('navigates to /upload with no spot when none is currently selected', () => {
    mocks.isAuthenticated = true;
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: undefined },
    });
  });

  it('does not show the panel minimize control on the cart route', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();
  });

  it('uses the user preference while browsing normal panel routes', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    await waitFor(() => {
      expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
    });

    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    rerender(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
  });

  it('updates the user preference when the photographer toggles expand and collapse', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: 'Report feed layout ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    await waitFor(() => expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'true'));

    act(() => usePanelExpansionStore.getState().setBrowsingPanelExpanded(false));

    await waitFor(() => expect(screen.getByTestId('side-panel')).toHaveAttribute('data-expanded', 'false'));
  });

  it('opens the cart route in the full-size panel', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');
  });

  it('forces a route workspace open without overwriting browse or gallery preferences', () => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: false });
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: 'Favorites' })).toBeInTheDocument();
  });

  it('compacts expanded gallery when the shared map action changes its preference', async () => {
    mocks.matches = [{
      routeId: '/_panel/$spotId/gallery',
      staticData: { appRouteIntent: 'galleryWorkspace' },
    }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);
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
    const { rerender } = render(<Component />);

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
    rerender(<Component />);
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
    const { rerender } = render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-a' },
    });

    mocks.matches = [{ routeId: '/_panel/$spotId', staticData: {} }];
    rerender(<Component />);
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
    render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-has-back')).toBe('false');
  });

  it('uses compact map-input behavior on the upload route, with a chevron-only back control', async () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    const { rerender } = render(<Component />);

    expect(screen.getByText('Upload')).not.toBeNull();

    mocks.activeWorkspace = { id: 'workspace-1', kind: 'SESSION_EDIT' };
    rerender(<Component />);

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
    const { rerender } = render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Expand panel' }));

    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    runNextFrame = undefined;
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    rerender(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    act(() => runNextFrame?.(0));

    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');
    vi.unstubAllGlobals();
  });

  it('lets the cart header span the full panel width', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

    expect(screen.getByTestId('side-panel').getAttribute('data-header-full-width')).toBe('true');
  });

  it('routes cart visitors without a spot origin back to the feed', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' }, search: {} }];
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

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
    const { rerender } = render(<Component />);

    mocks.matches = [{ routeId: '/_panel/', staticData: {} }];
    rerender(<Component />);

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
    const { rerender } = render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('false');

    runNextFrame = undefined;
    mocks.matches = [{
      routeId: '/_panel/$spotId/session/$sessionId',
      staticData: { appRouteIntent: 'routeWorkspace' },
      loaderData: null,
    }];
    rerender(<Component />);
    act(() => runNextFrame?.(0));
    expect(screen.getByTestId('side-panel').getAttribute('data-expanded')).toBe('true');

    runNextFrame = undefined;
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    rerender(<Component />);
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
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

    expect(screen.getByRole('button', { name: 'Report feed layout ready' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/gallery' });
  });

  it('picks a new spot into the gallery route from the all-spots gallery', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    mocks.params = {};
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    render(<Component />);

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
    const { rerender } = render(<Component />);
    expect(screen.queryByRole('button', { name: 'Report feed layout ready' })).not.toBeInTheDocument();

    // Picking a new spot restores real, unfiltered-by-the-old-spot content.
    fireEvent.click(screen.getByRole('button', { name: 'Select spot-b' }));
    mocks.params = { spotId: 'spot-b' };
    mocks.matches = [
      { routeId: '/_panel/$spotId', staticData: {} },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    rerender(<Component />);

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
    render(<Component />);

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
    render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear spot search' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('hides the side panel throughout the add-spot flow, and restores once the flow exits', async () => {
    const Component = (Route as unknown as { component: ComponentType }).component;
    render(<Component />);

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
    render(<Component />);

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
    render(<Component />);

    const favorites = screen.getByRole('button', { name: 'Favorites' });
    fireEvent.click(favorites);

    expect(mocks.openAuth).toHaveBeenCalledTimes(1);
    expect(favorites).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the favorite-spots filter available and active after switching to gallery', () => {
    mocks.isAuthenticated = true;
    const Component = (Route as unknown as { component: ComponentType }).component;
    const { rerender } = render(<Component />);

    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    rerender(<Component />);

    expect(screen.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true');
  });
});
