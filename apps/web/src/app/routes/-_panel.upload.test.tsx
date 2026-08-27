import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from './_panel.upload';
import type { UploadWorkspaceState, UploadWorkspaceSummary } from '@swelldays/contracts';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { render } from 'test/setup/render';

const activeWorkspace: UploadWorkspaceSummary = {
  id: 'workspace-active',
  kind: 'NEW_SESSION',
  status: 'ACTIVE',
  targetSessionId: null,
  spotId: 'spot-a',
  startsAt: null,
  endsAt: null,
  photoPrice: 300,
  videoPrice: 500,
  createdAt: new Date('2026-01-01T05:00:00Z'),
  updatedAt: new Date('2026-01-01T05:00:00Z'),
  hasAssets: false,
};

const workspaceState: UploadWorkspaceState = {
  workspace: activeWorkspace,
  existingMedia: [],
  assets: [],
  stagedRemovalIds: [],
  attempts: [],
};

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  openAuthModal: vi.fn(),
  search: { workspaceId: 'workspace-active' as string | undefined, spotId: undefined as string | undefined },
  activeQuery: {
    data: undefined as UploadWorkspaceSummary | null | undefined,
    isLoading: false,
  },
  stateQuery: {
    data: undefined as UploadWorkspaceState | undefined,
    isError: false,
    isLoading: false,
  },
  spotPreview: {
    data: { id: 'spot-a', name: 'Spot A', location: 'Beach' } as { id: string; name: string; location: string } | undefined,
  },
  user: { isAuthenticated: true, isLoading: false },
  sizeBand: 'wide' as 'compact' | 'constrained' | 'wide',
  heightBand: 'regular' as 'short' | 'regular',
  updateWorkspace: vi.fn(),
  notifyError: vi.fn(),
  setPanelRouteBackAction: vi.fn<(
    action: { onBack: () => void; disabled: boolean } | null,
  ) => void>(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => mocks.search,
  }),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ mutateAsync: mocks.updateWorkspace }),
  useQuery: (options: { queryKey: unknown[] }) => (
    options.queryKey[0] === 'uploads.getActiveWorkspace' ? mocks.activeQuery : mocks.stateQuery
  ),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => mocks.user,
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

vi.mock('shared/lib/notifications', () => ({
  notify: { error: mocks.notifyError },
}));

vi.mock('entities/Identity', () => ({
  useAuthModal: () => ({ open: mocks.openAuthModal }),
}));

vi.mock('entities/Spot', () => ({
  useSpotPreview: () => mocks.spotPreview,
}));

vi.mock('./_panel', () => ({
  useSetPanelRouteBackAction: () => mocks.setPanelRouteBackAction,
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      getActiveWorkspace: { queryOptions: () => ({ queryKey: ['uploads.getActiveWorkspace'] }) },
      getWorkspaceState: { queryOptions: (input: unknown) => ({ queryKey: ['uploads.getWorkspaceState', input] }), queryKey: (input: unknown) => ['uploads.getWorkspaceState', input] },
      updateWorkspace: { mutationOptions: vi.fn() },
    },
  }),
}));

vi.mock('widgets/FeedDrawer', () => ({
  FeedSearch: ({
    activeSpot,
    onSpotSelect,
    autoFocus,
  }: {
    activeSpot: { id: string } | null;
    onSpotSelect: (spot: { id: string; name: string }) => void;
    autoFocus?: boolean;
  }) => (
    <div>
      <input aria-label="Upload spot search" autoFocus={autoFocus} />
      <span data-testid="selected-spot">{activeSpot?.id ?? 'none'}</span>
      <button onClick={() => onSpotSelect({ id: 'spot-b', name: 'Spot B' })}>Select Spot B</button>
    </div>
  ),
}));

vi.mock('features/Upload', () => ({
  UploadSidebar: ({
    header,
    onBackActionChange,
    workspaceState: state,
    spotId,
    onWorkspaceCreated,
    onWorkspaceDiscarded,
  }: {
    header?: ReactNode;
    onBackActionChange?: (action: { onBack: () => void; disabled: boolean } | null) => void;
    workspaceState?: UploadWorkspaceState;
    spotId?: string | null;
    onWorkspaceCreated?: (workspaceId: string) => void;
    onWorkspaceDiscarded?: () => void;
  }) => (
    <div>
      <div data-testid="upload-sidebar-header">{header}</div>
      <span data-testid="has-panel-back-action">{onBackActionChange ? 'yes' : 'no'}</span>
      <span data-testid="workspace-id">{state?.workspace.id ?? 'none'}</span>
      <span data-testid="publish-spot">{spotId ?? 'none'}</span>
      {onWorkspaceCreated && (
        <button onClick={() => onWorkspaceCreated('lazily-created-workspace')}>Simulate first upload</button>
      )}
      <button onClick={() => onWorkspaceDiscarded?.()}>Simulate gallery discard</button>
    </div>
  ),
}));

function UploadPanelHarness() {
  const Component = (Route as unknown as { component: ComponentType }).component;
  return (
    <AppShellLayoutPolicyProvider
      routeIntent="mapInput"
      browseExpanded={false}
      galleryExpanded={false}
    >
      <Component />
    </AppShellLayoutPolicyProvider>
  );
}

function renderUploadPanel() {
  return render(<UploadPanelHarness />);
}

function getRegisteredPanelBackAction() {
  const action = mocks.setPanelRouteBackAction.mock.calls.find(([value]) => value)?.[0];
  if (!action) throw new Error('Expected the Upload route to register a panel Back action.');
  return action;
}

describe('UploadPanel workspace routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.search.workspaceId = 'workspace-active';
    mocks.search.spotId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.activeQuery.isLoading = false;
    mocks.stateQuery.data = workspaceState;
    mocks.stateQuery.isError = false;
    mocks.stateQuery.isLoading = false;
    mocks.spotPreview.data = { id: 'spot-a', name: 'Spot A', location: 'Beach' };
    mocks.user.isAuthenticated = true;
    mocks.user.isLoading = false;
    mocks.sizeBand = 'wide';
    mocks.heightBand = 'regular';
    mocks.updateWorkspace.mockResolvedValue({ id: 'workspace-active' });
  });

  it('renders the requested workspace state', () => {
    renderUploadPanel();

    expect(screen.getByTestId('workspace-id').textContent).toBe('workspace-active');
    expect(screen.getByTestId('publish-spot').textContent).toBe('spot-a');
  });

  it('renders the spot selector in the upload sidebar header', () => {
    renderUploadPanel();

    expect(within(screen.getByTestId('upload-sidebar-header')).getByTestId('selected-spot').textContent).toBe('spot-a');
  });

  it('allows the panel title row to own the back action', () => {
    renderUploadPanel();

    expect(screen.getByTestId('has-panel-back-action').textContent).toBe('yes');
  });

  it('persists spot selection to the workspace', async () => {
    renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Select Spot B' }));

    await waitFor(() => {
      expect(mocks.updateWorkspace).toHaveBeenCalledWith({ workspaceId: 'workspace-active', spotId: 'spot-b' });
    });
  });

  it('stores the selected workspace spot in the upload URL after persisting it', async () => {
    renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Select Spot B' }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/upload',
        search: { workspaceId: 'workspace-active', spotId: 'spot-b' },
        replace: true,
      });
    });
  });

  it('redirects to an existing active workspace', () => {
    mocks.search.workspaceId = undefined;
    mocks.activeQuery.data = activeWorkspace;
    mocks.stateQuery.data = undefined;
    renderUploadPanel();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { workspaceId: 'workspace-active' },
      replace: true,
    });
  });

  it('shows a loading state while the requested workspace is opening', () => {
    mocks.stateQuery.data = undefined;
    mocks.stateQuery.isLoading = true;
    renderUploadPanel();

    expect(screen.getByRole('status').textContent).toBe('Opening upload workspace…');
  });

  it('renders the new-upload sidebar while active workspace discovery is still loading', () => {
    mocks.search.workspaceId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.activeQuery.isLoading = true;
    mocks.stateQuery.data = undefined;
    renderUploadPanel();

    expect(screen.getByTestId('workspace-id').textContent).toBe('none');
    expect(screen.getByTestId('publish-spot').textContent).toBe('none');
  });

  it('stores a pre-workspace spot selection in the upload URL', () => {
    mocks.search.workspaceId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.stateQuery.data = undefined;
    renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Select Spot B' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-b' },
      replace: true,
    });
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();
  });

  it('navigates to the lazily-created workspace once the first file starts uploading', async () => {
    mocks.search.workspaceId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.stateQuery.data = undefined;
    renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate first upload' }));

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: '/upload',
        search: { workspaceId: 'lazily-created-workspace' },
        replace: true,
      });
    });
  });

  it('returns to a fresh upload after gallery discard while preserving the selected spot', () => {
    renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Simulate gallery discard' }));

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/upload',
      search: { spotId: 'spot-a' },
      replace: true,
    });
  });

  it('offers sign-in before attempting to load protected workspace state, then restores the workspace after sign-in', () => {
    mocks.user.isAuthenticated = false;
    mocks.stateQuery.data = undefined;
    const { rerender } = renderUploadPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.openAuthModal).toHaveBeenCalledOnce();

    mocks.user.isAuthenticated = true;
    mocks.stateQuery.data = workspaceState;
    rerender(<UploadPanelHarness />);

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-id').textContent).toBe('workspace-active');
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.setPanelRouteBackAction).toHaveBeenLastCalledWith(null);
  });

  it('registers a signed-out close action that returns to the staged spot', () => {
    mocks.user.isAuthenticated = false;
    mocks.search.workspaceId = undefined;
    mocks.search.spotId = 'spot-a';
    mocks.stateQuery.data = undefined;

    renderUploadPanel();

    expect(mocks.setPanelRouteBackAction).toHaveBeenCalledWith({
      onBack: expect.any(Function),
      disabled: false,
    });
    const action = getRegisteredPanelBackAction();
    action.onBack();

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/$spotId',
      params: { spotId: 'spot-a' },
    });
  });

  it('registers a signed-out close action that returns to Browse without a staged spot', () => {
    mocks.user.isAuthenticated = false;
    mocks.search.workspaceId = undefined;
    mocks.search.spotId = undefined;
    mocks.stateQuery.data = undefined;

    renderUploadPanel();

    const action = getRegisteredPanelBackAction();
    action.onBack();

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('keeps the keyboard closed when a new upload opens in the compact bottom sheet', () => {
    mocks.search.workspaceId = undefined;
    mocks.search.spotId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.stateQuery.data = undefined;
    mocks.spotPreview.data = undefined;
    mocks.sizeBand = 'compact';

    renderUploadPanel();

    expect(screen.getByRole('textbox', { name: 'Upload spot search' })).not.toHaveFocus();
  });

  it('focuses the spot search for a new upload in the wide persistent panel', () => {
    mocks.search.workspaceId = undefined;
    mocks.search.spotId = undefined;
    mocks.activeQuery.data = undefined;
    mocks.stateQuery.data = undefined;
    mocks.spotPreview.data = undefined;

    renderUploadPanel();

    expect(screen.getByRole('textbox', { name: 'Upload spot search' })).toHaveFocus();
  });
});
