import { readFileSync } from 'node:fs';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { render as renderWithProviders } from 'test/setup/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { UploadSidebar } from './UploadSidebar';
import type { UploadWorkspaceState } from 'shared/types/uploadWorkspace';

const uploadSidebarCss = readFileSync('src/features/Upload/ui/UploadSidebar.module.css', 'utf8');

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = uploadSidebarCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

function render(children: ReactNode) {
  return renderWithProviders(<PanelLayout>{children}</PanelLayout>);
}

const mocks = vi.hoisted(() => ({
  updateWorkspace: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
  publish: vi.fn(),
  discardAll: vi.fn().mockResolvedValue(undefined),
  canPublish: true,
  hasTriedPublish: false,
  violations: [] as Array<'spot' | 'media' | 'price' | 'time'>,
  queue: [] as Array<{ kind: string; status?: string }>,
  scrollIntoView: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: () => ({ mutateAsync: mocks.updateWorkspace }),
}));

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    uploads: {
      updateWorkspace: { mutationOptions: (options?: object) => options ?? {} },
      getWorkspaceState: { queryKey: (input: unknown) => ['uploads.getWorkspaceState', input] },
    },
  }),
}));

vi.mock('../model', async (importOriginal) => ({
  // Keep pure policy helpers (getUploadQueueStatus) real; mock only the hooks.
  ...(await importOriginal<typeof import('../model')>()),
  useUploadQueue: () => ({ queue: mocks.queue, hasActiveUploads: false, selectableItems: [] }),
  useUploadManager: () => ({
    addFiles: vi.fn(),
    addDriveSelections: vi.fn(),
    remove: vi.fn(),
    retry: vi.fn(),
    discardAll: mocks.discardAll,
    abortAllTransfers: vi.fn(),
  }),
  usePublishUploadSession: () => ({
    canPublish: mocks.canPublish,
    hasTriedPublish: mocks.hasTriedPublish,
    isPending: false,
    publish: mocks.publish,
    violations: mocks.violations,
  }),
  isVideoItem: () => false,
}));

vi.mock('./steps/UploadStep', () => ({
  UploadStep: ({ discardAll }: { discardAll: () => Promise<void> }) => (
    <button type="button" onClick={() => { void discardAll(); }}>Discard uploaded files</button>
  ),
}));
vi.mock('./steps/TimeStep', () => ({ TimeStep: () => null }));
vi.mock('./steps/PriceStep', () => ({
  PriceStep: ({ onPhotoPriceCommit }: { onPhotoPriceCommit: (value: number) => void }) => (
    <button type="button" onClick={() => onPhotoPriceCommit(700)}>Commit photo price</button>
  ),
}));

function makeWorkspaceState(kind: 'NEW_SESSION' | 'SESSION_EDIT' = 'NEW_SESSION'): UploadWorkspaceState {
  return {
    workspace: {
      id: 'workspace-1',
      kind,
      status: 'ACTIVE',
      targetSessionId: kind === 'SESSION_EDIT' ? 'session-1' : null,
      spotId: 'spot-1',
      startsAt: new Date('2026-01-01T06:00:00Z'),
      endsAt: new Date('2026-01-01T08:00:00Z'),
      photoPrice: 300,
      videoPrice: 500,
      createdAt: new Date('2026-01-01T05:00:00Z'),
      updatedAt: new Date('2026-01-01T05:00:00Z'),
    },
    existingMedia: [],
    assets: [],
    stagedRemovalIds: [],
    attempts: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.discardAll.mockResolvedValue(undefined);
  mocks.canPublish = true;
  mocks.hasTriedPublish = false;
  mocks.violations = [];
  mocks.queue = [];
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: mocks.scrollIntoView,
  });
});

describe('UploadSidebar workspace behavior', () => {
  it('places the sidebar header before the body, with Cancel and Publish together in the footer', () => {
    render(
      <UploadSidebar
        header={<span data-testid="upload-sidebar-header">Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const header = screen.getByTestId('upload-sidebar-header');
    const bodyControl = screen.getByRole('button', { name: 'Commit photo price' });
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    const publishButton = screen.getByRole('button', { name: 'Publish' });

    expect(cancelButton.closest('footer')).toBe(publishButton.closest('footer'));
    expect(publishButton.closest('[data-panel-layout-footer]')).not.toBeNull();
    expect(publishButton.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(header.compareDocumentPosition(bodyControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bodyControl.compareDocumentPosition(publishButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('registers a non-destructive back action that closes without discarding', async () => {
    const onBackActionChange = vi.fn();
    const onClose = vi.fn();

    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={onClose}
        onBackActionChange={onBackActionChange}
        onComplete={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onBackActionChange).toHaveBeenCalledWith(expect.objectContaining({
        disabled: false,
        onBack: expect.any(Function),
      }));
    });

    const action = onBackActionChange.mock.calls.at(-1)?.[0] as { onBack: () => void };
    action.onBack();

    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.discardAll).not.toHaveBeenCalled();
  });

  it('discards immediately from the footer Cancel when the queue is empty', async () => {
    const onClose = vi.fn();

    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={onClose}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(mocks.discardAll).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('asks for confirmation before discarding uploaded media', async () => {
    mocks.queue = [{ kind: 'existing' }, { kind: 'existing' }];
    const onClose = vi.fn();

    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={onClose}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mocks.discardAll).not.toHaveBeenCalled();
    // jsdom never runs Mantine's mount transition, so the dropdown stays
    // display:none for role queries; use text queries inside it instead.
    expect(await screen.findByText('Discard this upload?')).toBeInTheDocument();
    expect(screen.getByText('2 uploaded files will be deleted.')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Keep'));
    expect(mocks.discardAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(await screen.findByText('Discard'));

    await waitFor(() => {
      expect(mocks.discardAll).toHaveBeenCalledOnce();
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('resets the upload workspace after media-gallery discard succeeds', async () => {
    const onWorkspaceDiscarded = vi.fn();

    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onWorkspaceDiscarded={onWorkspaceDiscarded}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Discard uploaded files' }));

    await waitFor(() => {
      expect(mocks.discardAll).toHaveBeenCalledOnce();
      expect(onWorkspaceDiscarded).toHaveBeenCalledOnce();
    });
  });

  it('labels the primary action as Save for a session edit workspace', () => {
    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState('SESSION_EDIT')}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('persists field commits to the workspace', async () => {
    render(
      <UploadSidebar
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Commit photo price' }));

    await waitFor(() => {
      expect(mocks.updateWorkspace).toHaveBeenCalledWith({ workspaceId: 'workspace-1', photoPrice: 700 });
    });
  });

  it('keeps an incomplete Publish action de-emphasized while preserving validation on click', () => {
    mocks.canPublish = false;
    mocks.violations = ['media', 'time'];

    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton.closest('footer')).toHaveAttribute('data-ready', 'false');

    fireEvent.click(publishButton);
    expect(mocks.publish).toHaveBeenCalledTimes(1);
  });

  it('marks the Publish action ready for emphasis only when publishing is allowed', () => {
    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton.closest('footer')).toHaveAttribute('data-ready', 'true');
  });

  it('keeps the projected footer transparent and gives the publish button its own borderless glass gradient', () => {
    const footerRule = cssRule('.publishFooter');

    expect(footerRule).not.toContain('background:');

    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish' }).className).not.toMatch(/panelControl/);
  });

  it('gives the empty file-selector pad even padding on every side', () => {
    const uploadZoneRule = cssRule('.sidebar :global([data-upload-zone])');

    expect(uploadZoneRule).toBe('padding: var(--upload-empty-padding);');
  });

  it('uses the spot-style validity rail on the media field without recoloring its full border', () => {
    const readyRule = cssRule(".mediaSection[data-ready='true'] [data-upload-module]");
    const invalidRule = cssRule(".mediaSection[aria-invalid='true'] [data-upload-module]");

    expect(readyRule).toContain('box-shadow: inset 3px 0 0 var(--wa-accent-spot)');
    expect(readyRule).not.toContain('border-color');
    expect(invalidRule).toContain('box-shadow: inset 3px 0 0 var(--wa-status-danger)');
    expect(invalidRule).not.toContain('border-color');
  });

  it('exposes ready state for each validation step independently', () => {
    mocks.canPublish = false;
    mocks.violations = ['media', 'time'];

    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'Spot' })).toHaveAttribute('data-ready', 'true');
    expect(screen.getByRole('region', { name: 'Media' })).toHaveAttribute('data-ready', 'false');
    expect(screen.getByRole('region', { name: 'Price' })).toHaveAttribute('data-ready', 'true');
    expect(screen.getByRole('region', { name: 'Shoot time' })).toHaveAttribute('data-ready', 'false');
  });

  it('scrolls to and pulses only the first invalid section', async () => {
    mocks.canPublish = false;
    mocks.hasTriedPublish = true;
    mocks.violations = ['spot', 'media', 'time'];

    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId={null}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    const spot = screen.getByRole('region', { name: 'Spot' });
    const media = screen.getByRole('region', { name: 'Media' });
    const time = screen.getByRole('region', { name: 'Shoot time' });

    await waitFor(() => {
      expect(mocks.scrollIntoView).toHaveBeenCalledTimes(1);
      expect(mocks.scrollIntoView.mock.instances[0]).toBe(spot);
      expect(spot).toHaveAttribute('data-validation-pulse', 'true');
    });

    expect(spot).toHaveAttribute('aria-invalid', 'true');
    expect(media).toHaveAttribute('aria-invalid', 'true');
    expect(time).toHaveAttribute('aria-invalid', 'true');
    expect(media).not.toHaveAttribute('data-validation-pulse');
    expect(time).not.toHaveAttribute('data-validation-pulse');
  });

  it('scrolls to shoot time when it is the first invalid section', async () => {
    mocks.canPublish = false;
    mocks.hasTriedPublish = true;
    mocks.violations = ['time'];

    render(
      <UploadSidebar
        header={<span>Spot search</span>}
        workspaceState={makeWorkspaceState()}
        spotId="spot-1"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    const time = screen.getByRole('region', { name: 'Shoot time' });
    await waitFor(() => {
      expect(mocks.scrollIntoView.mock.instances[0]).toBe(time);
      expect(time).toHaveAttribute('data-validation-pulse', 'true');
    });
  });
});
