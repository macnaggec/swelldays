import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobeScene } from './GlobeScene';
import type { LngLat } from 'shared/types/coordinates';
import type { DeclaredAppRouteIntent } from 'shared/model/appRouteIntent';
import type { DrawerGeometry } from 'shared/ui/DrawerShell';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  isUpdatingWorkspace: false,
  browsingExpanded: false,
  galleryExpanded: true,
  drawerGeometry: null as DrawerGeometry | null,
  setBrowsingPanelExpanded: vi.fn(),
  setGalleryPanelExpanded: vi.fn(),
  matches: [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }] as Array<{
    routeId: string;
    params?: { spotId?: string };
    search?: { workspaceId?: string; spotId?: string };
    staticData?: { appRouteIntent?: DeclaredAppRouteIntent };
  }>,
  navigate: vi.fn(),
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
    rightOccludedPx?: number;
  }) => (
    <div
      data-coordinate-picker-active={String(isCoordinatePickerActive)}
      data-show-navigation-control={String(showNavigationControl)}
      data-temp-pin={tempPin?.join(',') ?? ''}
      data-selected-spot-id={selectedSpotId ?? ''}
      data-has-camera-intent={String('cameraIntent' in restProps)}
      data-interaction-policy={String(restProps.interactionPolicy)}
      data-right-occluded-px={String(restProps.rightOccludedPx)}
    >
      <button onClick={() => onSpotSelect({ id: 'spot-1' })}>Select Pipeline</button>
      <button onClick={() => onCameraGestureStart?.()}>Explore map</button>
      <button onClick={() => onMapCoordinateClick?.([151.2, -33.85])}>Place pin</button>
    </div>
  ),
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
});

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
    render(<GlobeScene />);

    fireEvent.click(screen.getByRole('button', { name: 'Select Pipeline' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith('Network down', 'Unable to Save Spot');
    });
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('stores the selected workspace spot in the upload URL and persists it', async () => {
    mocks.updateWorkspace.mockResolvedValue({ id: 'workspace-1' });
    render(<GlobeScene />);

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
    render(<GlobeScene />);

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
    render(<GlobeScene />);

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
    render(<GlobeScene />);

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
    const { rerender } = render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', '');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-has-camera-intent', 'false');

    mocks.matches = [{ routeId: '/_panel/$spotId', params: { spotId: 'spot-1' } }];
    rerender(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'spot-1');
    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-has-camera-intent', 'false');
  });

  it('centers the map on the spot chosen via the upload workspace, not just the route', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    mocks.uploadWorkspaceState = { workspace: { spotId: null } };
    const { rerender } = render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', '');

    // Resumed workspaces may have a persisted spot before the upload URL carries one,
    // so the map should still pick up the workspace-state query.
    mocks.uploadWorkspaceState = { workspace: { spotId: 'spot-1' } };
    rerender(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'spot-1');
  });

  it('falls back to the seed spotId from the upload URL before the workspace query resolves', () => {
    mocks.matches = [{
      routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' },
      search: { workspaceId: 'workspace-1', spotId: 'seed-spot' },
    }];
    mocks.uploadWorkspaceState = undefined;
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'seed-spot');
  });

  it('uses the upload URL spot while the workspace query still has the previous spot', () => {
    mocks.matches = [{
      routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' },
      search: { workspaceId: 'workspace-1', spotId: 'new-spot' },
    }];
    mocks.uploadWorkspaceState = { workspace: { spotId: 'old-spot' } };
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-selected-spot-id', 'new-spot');
  });

  it('keeps gallery mode when a photographer selects a map marker', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    render(<GlobeScene />);

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
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setBrowsingPanelExpanded).toHaveBeenCalledWith(false);
  });

  it('passes background policy to the map for a route-required workspace', () => {
    mocks.matches = [{ routeId: '/_panel/cart', staticData: { appRouteIntent: 'routeWorkspace' } }];
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'background');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setBrowsingPanelExpanded).not.toHaveBeenCalled();
    expect(mocks.setGalleryPanelExpanded).not.toHaveBeenCalled();
  });

  it('keeps expanded gallery interactive and compacts its preference when camera exploration starts', () => {
    mocks.matches = [{ routeId: '/_panel/gallery', staticData: { appRouteIntent: 'galleryWorkspace' } }];
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
    fireEvent.click(screen.getByRole('button', { name: 'Explore map' }));
    expect(mocks.setGalleryPanelExpanded).toHaveBeenCalledWith(false);
  });

  it('keeps compact browsing interactive', () => {
    mocks.browsingExpanded = false;
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });

  it('keeps Add Spot interactive regardless of the browse preference', () => {
    mocks.addSpotState.isActive = true;
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });

  it('keeps upload spot selection interactive regardless of the browse preference', () => {
    mocks.matches = [{ routeId: '/_panel/upload', staticData: { appRouteIntent: 'mapInput' }, search: { workspaceId: 'workspace-1' } }];
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-interaction-policy', 'interactive');
  });
});

describe('GlobeScene sidebar occlusion', () => {
  const originalInnerWidth = window.innerWidth;

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
    render(<GlobeScene />);

    expect(screen.getByText('Select Pipeline').parentElement).toHaveAttribute('data-right-occluded-px', '800');
  });
});
