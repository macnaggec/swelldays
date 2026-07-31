import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobeScene } from './GlobeScene';
import type { LngLat } from 'shared/types/coordinates';
import { resolveAppRouteIntent, type DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import type { DrawerGeometry } from 'shared/ui/DrawerShell';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  isUpdatingWorkspace: false,
  browsingExpanded: false,
  galleryExpanded: true,
  drawerGeometry: null as DrawerGeometry | null,
  drawerTargetGeometry: ((): DrawerGeometry | null => null)(),
  setBrowsingPanelExpanded: vi.fn(),
  setGalleryPanelExpanded: vi.fn(),
  matches: [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }] as Array<{
    routeId: string;
    params?: { spotId?: string };
    search?: { workspaceId?: string; spotId?: string };
    staticData?: { appRouteIntent?: DeclaredAppRouteIntent };
  }>,
  navigate: vi.fn(),
  browseSurfaceMode: 'results' as 'map' | 'results',
  showBrowseResults: vi.fn(),
  notifyError: vi.fn(),
  addSpotState: {
    isActive: false,
    tempPin: null as LngLat | null,
    setTempPin: vi.fn(),
  },
  updateWorkspace: vi.fn(),
  uploadWorkspaceState: undefined as { workspace: { spotId: string | null } } | undefined,
}));

vi.mock('widgets/GlobeMap', () => ({
  GlobeMap: ({
    isCoordinatePickerActive,
    showNavigationControl,
    onMapCoordinateClick,
    onSpotSelect,
    onCameraGestureStart,
    selectedSpotId,
    tempPin,
    ...restProps
  }: {
    isCoordinatePickerActive?: boolean;
    showNavigationControl?: boolean;
    onMapCoordinateClick?: (coords: LngLat) => void;
    onSpotSelect: (spot: { id: string }) => void;
    onCameraGestureStart?: () => void;
    selectedSpotId?: string | null;
    tempPin?: LngLat | null;
    interactionPolicy?: 'interactive' | 'background';
    cameraInsetsPx?: { top: number; right: number; bottom: number; left: number };
  }) => (
    <div
      data-coordinate-picker-active={String(isCoordinatePickerActive)}
      data-show-navigation-control={String(showNavigationControl)}
      data-temp-pin={tempPin?.join(',') ?? ''}
      data-selected-spot-id={selectedSpotId ?? ''}
      data-has-camera-intent={String('cameraIntent' in restProps)}
      data-interaction-policy={String(restProps.interactionPolicy)}
      data-camera-inset-right-px={String(restProps.cameraInsetsPx?.right)}
      data-camera-inset-top-px={String(restProps.cameraInsetsPx?.top)}
      data-camera-inset-bottom-px={String(restProps.cameraInsetsPx?.bottom)}
    >
      <button onClick={() => onSpotSelect({ id: 'spot-1' })}>Select Pipeline</button>
      <button onClick={() => onCameraGestureStart?.()}>Explore map</button>
      <button onClick={() => onMapCoordinateClick?.([151.2, -33.85])}>Place pin</button>
    </div>
  ),
  NO_MAP_CAMERA_INSETS: { top: 0, right: 0, bottom: 0, left: 0 },
}));

vi.mock('entities/Spot', () => ({
  useMapSpots: () => ({ data: [] }),
}));

vi.mock('features/AddSpot', () => ({
  AddSpotPanel: () => <div>Add spot panel</div>,
  useAddSpotStore: (selector: (state: typeof mocks.addSpotState) => unknown) =>
    selector(mocks.addSpotState),
}));

vi.mock('shared/model/panelExpansionStore', () => ({
  usePanelExpansionStore: (selector: (state: {
    browsingExpanded: boolean;
    galleryExpanded: boolean;
    setBrowsingPanelExpanded: typeof mocks.setBrowsingPanelExpanded;
    setGalleryPanelExpanded: typeof mocks.setGalleryPanelExpanded;
  }) => unknown) => selector({
    browsingExpanded: mocks.browsingExpanded,
    galleryExpanded: mocks.galleryExpanded,
    setBrowsingPanelExpanded: mocks.setBrowsingPanelExpanded,
    setGalleryPanelExpanded: mocks.setGalleryPanelExpanded,
  }),
}));

vi.mock('shared/ui/DrawerShell', () => ({
  useDrawerGeometry: () => mocks.drawerGeometry,
  useDrawerTargetGeometry: () => mocks.drawerTargetGeometry,
  useBrowseSurface: () => ({
    mode: mocks.browseSurfaceMode,
    showResults: mocks.showBrowseResults,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: mocks.updateWorkspace,
    isPending: mocks.isUpdatingWorkspace,
  }),
  useQuery: () => ({ data: mocks.uploadWorkspaceState }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('@tanstack/react-router', () => ({
  useMatches: () => mocks.matches,
  useNavigate: () => mocks.navigate,
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      updateWorkspace: { mutationOptions: vi.fn() },
      getWorkspaceState: {
        queryKey: (input: unknown) => ['uploads.getWorkspaceState', input],
        queryOptions: (input: unknown) => ({ queryKey: ['uploads.getWorkspaceState', input] }),
      },
    },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

beforeEach(() => {
  mocks.browsingExpanded = false;
  mocks.galleryExpanded = true;
  mocks.drawerGeometry = null;
  mocks.drawerTargetGeometry = null;
  mocks.browseSurfaceMode = 'results';
});

function globeSceneTree() {
  const routeIntent = resolveAppRouteIntent(
    mocks.matches,
    mocks.addSpotState.isActive ? 'immersiveMapInput' : undefined,
  );

  return (
    <AppShellLayoutPolicyProvider
      routeIntent={routeIntent}
      browseExpanded={mocks.browsingExpanded}
      galleryExpanded={mocks.galleryExpanded}
    >
      <GlobeScene />
    </AppShellLayoutPolicyProvider>
  );
}

function renderGlobeScene() {
  return render(globeSceneTree());
}

describe('GlobeScene upload spot selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceState = undefined;
    mocks.isUpdatingWorkspace = false;
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    mocks.addSpotState.isActive = false;
    mocks.addSpotState.tempPin = null;
  });

  it('shows the photographer when saving the selected spot fails', async () => {
    mocks.updateWorkspace.mockRejectedValue(new Error('Network down'));
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith('Network down', 'Unable to Save Spot');
    });
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('stores the selected workspace spot in the upload URL and persists it', async () => {
    mocks.updateWorkspace.mockResolvedValue({ id: 'workspace-1' });
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { workspaceId: 'workspace-1', spotId: 'spot-1' },
      replace: true,
    });
    await waitFor(() => {
      expect(mocks.updateWorkspace).toHaveBeenCalledWith({ workspaceId: 'workspace-1', spotId: 'spot-1' });
    });
  });

  it('stores the selected pre-workspace spot in the upload URL', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: {} }];
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-1' },
      replace: true,
    });
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });

  it('ignores another map selection while a spot save is pending', () => {
    mocks.isUpdatingWorkspace = true;
    renderGlobeScene();

    expect(screen.getByRole('status').textContent).toBe('Saving spot…');
    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });
});

describe('GlobeScene Add Spot flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceState = undefined;
    mocks.isUpdatingWorkspace = false;
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    mocks.addSpotState.isActive = true;
    mocks.addSpotState.tempPin = [151, -34];
  });

  it('passes Add Spot coordinate-picker state to the map and owns temp pin updates from coordinate clicks', () => {
    renderGlobeScene();

    expect(screen.getByText('Add spot panel')).toBeInTheDocument();
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-coordinate-picker-active', 'true');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-show-navigation-control', 'false');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-temp-pin', '151,-34');

    fireEvent.click(screen.getByRole('button', { name: 'Place pin' }));

    expect(mocks.addSpotState.setTempPin).toHaveBeenCalledWith([151.2, -33.85]);
  });
});

describe('GlobeScene selected spot ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceState = undefined;
    mocks.isUpdatingWorkspace = false;
    mocks.matches = [];
    mocks.addSpotState.isActive = false;
    mocks.addSpotState.tempPin = null;
  });

  it('passes the selected route spot as state without owning camera intent lifecycle', () => {
    const { rerender } = renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', '');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-has-camera-intent', 'false');

    mocks.matches = [{ routeId: '/_panel/$spotId', params: { spotId: 'spot-1' } }];
    rerender(globeSceneTree());

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'spot-1');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-has-camera-intent', 'false');
  });

  it('centers the map on the spot chosen via the upload workspace, not just the route', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    mocks.uploadWorkspaceState = { workspace: { spotId: null } };
    const { rerender } = renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', '');

    // Resumed workspaces may have a persisted spot before the upload URL carries one,
    // so the map should still pick up the workspace-state query.
    mocks.uploadWorkspaceState = { workspace: { spotId: 'spot-1' } };
    rerender(globeSceneTree());

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'spot-1');
  });

  it('falls back to the seed spotId from the upload URL before the workspace query resolves', () => {
    mocks.matches = [{
      routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' },
      search: { workspaceId: 'workspace-1', spotId: 'seed-spot' },
    }];
    mocks.uploadWorkspaceState = undefined;
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'seed-spot');
  });

  it('uses the upload URL spot while the workspace query still has the previous spot', () => {
    mocks.matches = [{
      routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' },
      search: { workspaceId: 'workspace-1', spotId: 'new-spot' },
    }];
    mocks.uploadWorkspaceState = { workspace: { spotId: 'old-spot' } };
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'new-spot');
  });

  it('opens the selected spot in Feed and requests the browse results surface', () => {
    mocks.matches = [];
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.showBrowseResults).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-1' },
    });
  });

  it('keeps a photographer in Feed sessions when picking a spot from the Feed', () => {
    mocks.matches = [{ routeId: '/_panel/$spotId', params: { spotId: 'spot-0' } }];
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-1' },
    });
  });

  it('keeps a photographer in the gallery when picking a spot from the all-spots gallery', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId/gallery',
      params: { spotId: 'spot-1' },
    });
  });

  it('keeps a photographer in the gallery when picking a new spot from an already-selected spot gallery', () => {
    mocks.matches = [
      { routeId: '/_panel/$spotId', params: { spotId: 'spot-0' } },
      { routeId: '/_panel/$spotId/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } },
    ];
    renderGlobeScene();

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId/gallery',
      params: { spotId: 'spot-1' },
    });
  });
});

describe('GlobeScene map interaction policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceState = undefined;
    mocks.isUpdatingWorkspace = false;
    mocks.matches = [{ routeId: '/_panel/', search: {} }];
    mocks.addSpotState.isActive = false;
    mocks.addSpotState.tempPin = null;
  });

  it('keeps expanded browsing interactive and compacts it when camera exploration starts', () => {
    mocks.browsingExpanded = true;
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setBrowsingPanelExpanded).toHaveBeenCalledWith(false);
  });

  it('passes background policy to the map for a route-required workspace', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' } }];
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'background');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setBrowsingPanelExpanded).not.toHaveBeenCalled();
    expect(mocks.setGalleryPanelExpanded).not.toHaveBeenCalled();
  });

  it('keeps expanded gallery interactive and compacts its preference when camera exploration starts', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setGalleryPanelExpanded).toHaveBeenCalledWith(false);
  });

  it('does not change the portrait browse preference when exploration starts beside the short side panel', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });
    mocks.browsingExpanded = true;

    renderGlobeScene();
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));

    expect(mocks.setBrowsingPanelExpanded).not.toHaveBeenCalled();

    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
  });

  it('keeps compact browsing interactive', () => {
    mocks.browsingExpanded = false;
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });

  it('keeps Add Spot interactive regardless of the browse preference', () => {
    mocks.addSpotState.isActive = true;
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });

  it('keeps upload spot selection interactive regardless of the browse preference', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });
});

describe('GlobeScene map camera insets', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadWorkspaceState = undefined;
    mocks.isUpdatingWorkspace = false;
    mocks.matches = [{ routeId: '/_panel/', search: {} }];
    mocks.addSpotState.isActive = false;
    mocks.addSpotState.tempPin = null;
    Object.defineProperty(window, 'innerWidth', { value: 2000, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
  });

  it('projects the measured drawer overlap instead of estimating from semantic shell state', () => {
    mocks.browsingExpanded = false;
    mocks.drawerGeometry = {
      left: 1200,
      top: 0,
      right: 2000,
      bottom: 900,
      width: 800,
      height: 900,
    };
    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-camera-inset-right-px', '800');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-camera-inset-bottom-px', '0');
  });

  it('uses the bottom sheet destination snap before its measured surface finishes moving', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    mocks.browseSurfaceMode = 'map';
    mocks.drawerGeometry = {
      left: 0,
      top: 557,
      right: 390,
      bottom: 844,
      width: 390,
      height: 287,
    };
    mocks.drawerTargetGeometry = {
      left: 0,
      top: 760,
      right: 390,
      bottom: 844,
      width: 390,
      height: 84,
    };

    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement)
      .toHaveAttribute('data-camera-inset-bottom-px', '84');
  });

  it('uses the side panel destination width while its measured surface is still map chrome', () => {
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });
    mocks.browseSurfaceMode = 'results';
    mocks.drawerGeometry = {
      left: 272,
      top: 12,
      right: 572,
      bottom: 72,
      width: 300,
      height: 60,
    };
    mocks.drawerTargetGeometry = {
      left: 464,
      top: 0,
      right: 844,
      bottom: 390,
      width: 380,
      height: 390,
    };

    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement)
      .toHaveAttribute('data-camera-inset-right-px', '380');
  });

  it('keeps map centering neutral while the floating side-panel chrome replaces results', () => {
    Object.defineProperty(window, 'innerWidth', { value: 844, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 390, configurable: true });
    mocks.browseSurfaceMode = 'map';
    mocks.drawerGeometry = {
      left: 464,
      top: 0,
      right: 844,
      bottom: 390,
      width: 380,
      height: 390,
    };
    mocks.drawerTargetGeometry = {
      left: 272,
      top: 12,
      right: 572,
      bottom: 72,
      width: 300,
      height: 60,
    };

    renderGlobeScene();

    expect(screen.getByText('Select Pipeline').parentElement)
      .toHaveAttribute('data-camera-inset-top-px', '0');
    expect(screen.getByText('Select Pipeline').parentElement)
      .toHaveAttribute('data-camera-inset-right-px', '0');
  });
});
