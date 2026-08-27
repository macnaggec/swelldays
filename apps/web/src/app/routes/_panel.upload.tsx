import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { PanelEmptyState, PanelRouteLayout } from 'shared/ui/PanelRouteLayout';
import { useTRPC } from 'shared/lib/trpc';
import { useUser } from 'shared/hooks/useUser';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { notify } from 'shared/lib/notifications';
import { FeedSearch } from 'widgets/FeedDrawer';
import { UploadSidebar } from 'features/Upload';
import type { Spot } from 'entities/Spot';
import { useSpotPreview } from 'entities/Spot';
import { useAuthModal } from 'entities/Identity';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { useSetPanelRouteBackAction } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/upload')({
  validateSearch: (search): { workspaceId?: string; spotId?: string } => ({
    workspaceId: typeof search.workspaceId === 'string' ? search.workspaceId : undefined,
    spotId: typeof search.spotId === 'string' ? search.spotId : undefined,
  }),
  staticData: { panelHeader: 'Upload', appRouteIntent: 'mapInput' },
  component: UploadPanel,
});

function UploadPanel() {
  const { workspaceId, spotId: seedSpotId } = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: isUserLoading } = useUser();
  const { open: openAuthModal } = useAuthModal();
  const layoutPolicy = useAppShellLayoutPolicy();
  const setPanelRouteBackAction = useSetPanelRouteBackAction();
  const { data: activeWorkspace } = useQuery({
    ...trpc.uploads.getActiveWorkspace.queryOptions(),
    enabled: isAuthenticated && !workspaceId,
  });
  const { data: workspaceState, isError, isLoading: isWorkspaceLoading } = useQuery({
    ...trpc.uploads.getWorkspaceState.queryOptions({ workspaceId: workspaceId ?? '' }),
    enabled: isAuthenticated && !!workspaceId,
  });
  const { mutateAsync: updateWorkspace } = useMutation(trpc.uploads.updateWorkspace.mutationOptions());

  const [selectedSpotOverride, setSelectedSpotOverride] = useState<string | null | undefined>();
  const stagedSpotId = selectedSpotOverride !== undefined
    ? selectedSpotOverride
    : (seedSpotId ?? workspaceState?.workspace.spotId ?? null);
  const { data: stagedSpot } = useSpotPreview(stagedSpotId ?? '', {
    enabled: !!stagedSpotId,
  });

  useEffect(() => {
    if (!workspaceId && activeWorkspace) {
      void navigate({ to: '/upload', search: { workspaceId: activeWorkspace.id }, replace: true });
    }
  }, [activeWorkspace, navigate, workspaceId]);

  const handleSpotChange = useCallback(async (newSpot: Spot | null) => {
    const nextSpotId = newSpot?.id ?? null;
    setSelectedSpotOverride(nextSpotId);
    if (!workspaceId) {
      void navigate({
        to: '/upload',
        search: nextSpotId ? { spotId: nextSpotId } : {},
        replace: true,
      });
      return;
    }

    void navigate({
      to: '/upload',
      search: nextSpotId ? { workspaceId, spotId: nextSpotId } : { workspaceId },
      replace: true,
    });

    try {
      await updateWorkspace({ workspaceId, spotId: nextSpotId });
      await queryClient.invalidateQueries({
        queryKey: trpc.uploads.getWorkspaceState.queryKey({ workspaceId }),
      });
    } catch (error) {
      notify.error(getErrorMessage(error), 'Could Not Change Spot');
    }
  }, [navigate, queryClient, trpc, updateWorkspace, workspaceId]);

  const handleClose = useCallback(() => {
    if (stagedSpotId) {
      void navigate({ to: '/$spotId', params: { spotId: stagedSpotId } });
    } else {
      void navigate({ to: '/' });
    }
  }, [navigate, stagedSpotId]);

  useEffect(() => {
    if (isUserLoading || isAuthenticated) return;
    setPanelRouteBackAction({ onBack: handleClose, disabled: false });
    return () => setPanelRouteBackAction(null);
  }, [handleClose, isAuthenticated, isUserLoading, setPanelRouteBackAction]);

  const handleComplete = useCallback((_sessionId: string) => {
    if (stagedSpotId) {
      void navigate({ to: '/$spotId', params: { spotId: stagedSpotId } });
    } else {
      void navigate({ to: '/' });
    }
  }, [navigate, stagedSpotId]);

  const handleWorkspaceCreated = useCallback((newWorkspaceId: string) => {
    void navigate({
      to: '/upload',
      search: stagedSpotId ? { workspaceId: newWorkspaceId, spotId: stagedSpotId } : { workspaceId: newWorkspaceId },
      replace: true,
    });
  }, [navigate, stagedSpotId]);

  const handleWorkspaceDiscarded = useCallback(() => {
    void navigate({
      to: '/upload',
      search: stagedSpotId ? { spotId: stagedSpotId } : {},
      replace: true,
    });
  }, [navigate, stagedSpotId]);

  // Chevron-only back control: leaving the panel keeps the draft workspace and
  // any in-flight transfers. Discard lives in the sidebar footer instead.
  const handleBackActionChange = useCallback((action: { onBack: () => void; disabled: boolean } | null) => {
    setPanelRouteBackAction(action
      ? { onBack: action.onBack, disabled: action.disabled }
      : null);
  }, [setPanelRouteBackAction]);

  if (isUserLoading) return null;
  if (!isAuthenticated) {
    return (
      <UploadEntryState
        title="Sign in to upload"
        description="Uploads are tied to your account so you can manage them later."
        actionLabel="Sign in"
        onAction={openAuthModal}
      />
    );
  }

  if (workspaceId) {
    if (isWorkspaceLoading) {
      return (
        <PanelRouteLayout>
          <UploadLoadingState label="Opening upload workspace…" />
        </PanelRouteLayout>
      );
    }
    if (isError || !workspaceState) {
      return (
        <UploadEntryState
          title="This upload workspace is unavailable"
          description="It may have been saved, cancelled, or belong to another account."
          actionLabel="Start a new upload"
          onAction={() => { void navigate({ to: '/upload', search: {}, replace: true }); }}
        />
      );
    }
  } else if (activeWorkspace) {
    return null;
  }

  const activeSpot = stagedSpotId ? stagedSpot ?? null : null;

  const header = (
    <FeedSearch
      activeSpot={activeSpot}
      onSpotSelect={(s) => handleSpotChange(s)}
      onClear={() => handleSpotChange(null)}
      autoFocus={!activeSpot && layoutPolicy.drawer.presentation !== 'bottomSheet'}
      placeholder={!activeSpot ? 'Where did you shoot?' : undefined}
    />
  );

  return (
    <PanelRouteLayout>
      <UploadSidebar
        header={header}
        workspaceState={workspaceState}
        spotId={stagedSpotId}
        onClose={handleClose}
        onBackActionChange={handleBackActionChange}
        onComplete={handleComplete}
        onWorkspaceCreated={handleWorkspaceCreated}
        onWorkspaceDiscarded={handleWorkspaceDiscarded}
      />
    </PanelRouteLayout>
  );
}

function UploadLoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        minHeight: 260,
        padding: 24,
        color: 'var(--wa-text-muted)',
      }}
    >
      {label}
    </div>
  );
}

function UploadEntryState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <PanelEmptyState
      title={title}
      description={description}
      actionLabel={actionLabel}
      onAction={onAction}
    />
  );
}
