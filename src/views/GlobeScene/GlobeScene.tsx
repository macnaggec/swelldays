import { GlobeMap, type MapSpotProjection } from 'widgets/GlobeMap';
import { useMapSpots } from 'entities/Spot';
import { AddSpotPanel, useAddSpotStore } from 'features/AddSpot';
import { FavoriteSpotButton } from 'features/FavoriteSpot';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatches, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { LngLat } from 'shared/types/coordinates';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { useTRPC } from 'shared/lib/trpc';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { notify } from 'shared/lib/notifications';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { materialClasses } from 'shared/ui/design-system';
import { useDrawerGeometry } from 'shared/ui/DrawerShell';
import classes from './GlobeScene.module.css';
import { deriveGlobeMotionPolicy } from './model/globeMotionPolicy';
import { deriveGlobeSceneMode } from './model/globeSceneMode';
import { deriveDrawerViewportOcclusionPx } from './model/drawerViewportOcclusion';
import { getOverviewMapBounds } from './model/overviewBoundsStrategy';

function subscribeDocumentVisibility(onStoreChange: () => void) {
  document.addEventListener('visibilitychange', onStoreChange);
  return () => document.removeEventListener('visibilitychange', onStoreChange);
}

function getDocumentHiddenSnapshot() {
  return document.hidden;
}

function useDocumentHidden() {
  return useSyncExternalStore(
    subscribeDocumentVisibility,
    getDocumentHiddenSnapshot,
    () => false,
  );
}

/**
 * GlobeScene — persistent globe view with floating UI.
 *
 * Lives at layout level — never remounts on panel open/close navigations.
 * Unmounted by AppShell while a full-page overlay route (e.g. admin) is
 * active, since those routes fully cover it and it would otherwise keep
 * rendering, animating, and fetching tiles/telemetry while invisible.
 * Camera position persists in useMapStore, so remounting on return restores
 * the same view.
 */
export function GlobeScene() {
  const { data: spots = [] } = useMapSpots(getOverviewMapBounds());
  const mapSpots = useMemo<MapSpotProjection[]>(
    () => spots.map(({ id, name, coords, status }) => ({ id, name, coords, status })),
    [spots],
  );
  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const tempPin = useAddSpotStore((s) => s.tempPin);
  const setTempPin = useAddSpotStore((s) => s.setTempPin);
  const [isUserExploring, setIsUserExploring] = useState(false);
  const isDocumentHidden = useDocumentHidden();
  const { prefersReducedMotion } = useViewportCapabilities();
  const { layoutViewportWidthPx: viewportWidthPx } = useViewportMetrics();
  const setBrowsingPanelExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryPanelExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const matches = useMatches();
  const routeIntent = resolveAppRouteIntent(
    matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const isImmersiveMapInput = routeIntent === 'immersiveMapInput';
  const layoutPolicy = useAppShellLayoutPolicy();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutateAsync: updateWorkspace, isPending: isUpdatingWorkspace } = useMutation(
    trpc.uploads.updateWorkspace.mutationOptions(),
  );
  const uploadMatch = matches.find((match) => match.routeId === '/_panel/upload');
  const uploadSearch = uploadMatch
    ? uploadMatch.search as { workspaceId?: string; spotId?: string }
    : undefined;
  const workspaceId = uploadSearch?.workspaceId;
  // The upload URL carries the freshest selected spot; workspace state covers resumed edits
  // whose persisted spot is available before the route has a spot search value.
  const { data: uploadWorkspaceState } = useQuery({
    ...trpc.uploads.getWorkspaceState.queryOptions({ workspaceId: workspaceId ?? '' }),
    enabled: !!workspaceId,
  });
  const uploadSeedSpotId = uploadSearch?.spotId;
  const spotMatch = matches.find((match) => match.routeId === '/_panel/$spotId');
  const routeSelectedSpotId = (spotMatch?.params as { spotId?: string } | undefined)?.spotId ?? null;
  const selectedSpotId = uploadMatch
    ? (uploadSeedSpotId ?? uploadWorkspaceState?.workspace.spotId ?? null)
    : routeSelectedSpotId;
  const sceneMode = deriveGlobeSceneMode({
    routeIntent,
    selectedSpotId,
    isUserExploring,
  });
  const motionPolicy = deriveGlobeMotionPolicy({
    sceneMode,
    isDocumentHidden,
    prefersReducedMotion,
  });
  const interactionPolicy = layoutPolicy.map.interaction === 'hidden'
    ? 'background'
    : layoutPolicy.map.interaction;
  const drawerGeometry = useDrawerGeometry();
  const isShellDrawerExpanded = layoutPolicy.drawer.state === 'expanded'
    || layoutPolicy.drawer.state === 'full';
  const drawerOccludedPx = deriveDrawerViewportOcclusionPx({
    drawerBounds: drawerGeometry,
    viewportWidthPx,
  });

  const handleSpotSelect = useCallback(async (spot: MapSpotProjection) => {
    if (isUpdatingWorkspace) return;

    if (sceneMode.kind !== 'uploadSpotSelection') {
      await navigate({
        to: routeIntent === 'galleryWorkspace' ? '/$spotId/gallery' : '/$spotId',
        params: { spotId: spot.id },
      });
      return;
    }

    if (!workspaceId) {
      await navigate({ to: '/upload', search: { spotId: spot.id }, replace: true });
      return;
    }

    void navigate({
      to: '/upload',
      search: { workspaceId, spotId: spot.id },
      replace: true,
    });

    try {
      await updateWorkspace({ workspaceId, spotId: spot.id });
      await queryClient.invalidateQueries({
        queryKey: trpc.uploads.getWorkspaceState.queryKey({ workspaceId }),
      });
    } catch (error) {
      notify.error(getErrorMessage(error), 'Unable to Save Spot');
    }
  }, [isUpdatingWorkspace, navigate, queryClient, routeIntent, sceneMode.kind, trpc, updateWorkspace, workspaceId]);

  const handleMapCoordinateClick = useCallback((coords: LngLat) => {
    setTempPin(coords);
  }, [setTempPin]);

  const handleCameraGestureStart = useCallback(() => {
    if (!isShellDrawerExpanded) return;

    if (routeIntent === 'galleryWorkspace') {
      setGalleryPanelExpanded(false);
    } else if (routeIntent === 'browse') {
      setBrowsingPanelExpanded(false);
    }
  }, [isShellDrawerExpanded, routeIntent, setBrowsingPanelExpanded, setGalleryPanelExpanded]);

  return (
    <div className={classes.root}>
      <GlobeMap
        spots={mapSpots}
        selectedSpotId={selectedSpotId}
        onSpotSelect={handleSpotSelect}
        motionPolicy={motionPolicy}
        interactionPolicy={interactionPolicy}
        rightOccludedPx={drawerOccludedPx}
        isCoordinatePickerActive={isImmersiveMapInput}
        showNavigationControl={layoutPolicy.map.navigationControl === 'visible'}
        tempPin={tempPin}
        onMapCoordinateClick={handleMapCoordinateClick}
        onUserExploreStart={() => setIsUserExploring(true)}
        onUserExploreEnd={() => setIsUserExploring(false)}
        onCameraGestureStart={handleCameraGestureStart}
        renderSelectedSpotContent={(spot) => <FavoriteSpotButton spotId={spot.id} />}
      />
      {isUpdatingWorkspace && (
        <div className={`${classes.saveStatus} ${materialClasses.status}`} role="status">Saving spot…</div>
      )}
      {isImmersiveMapInput && <AddSpotPanel />}
    </div>
  );
}
