import { GlobeMap, type MapSpotProjection, type MapLoadFailure } from 'widgets/GlobeMap';
import { useMapSpots, type Spot } from 'entities/Spot';
import { LazyAddSpotPanel, useAddSpotStore } from 'features/AddSpot';
import { FavoriteSpotButton } from 'features/FavoriteSpot';
import { useFirstVisitMapReadiness } from 'features/FirstVisit';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMatches, useNavigate } from '@tanstack/react-router';
import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LngLat } from '@swelldays/contracts/core';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { useTRPC } from 'shared/lib/trpc';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { notify } from 'shared/lib/notifications';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { materialClasses } from 'shared/ui/design-system';
import {
  useBrowseSurface,
  useDrawerGeometry,
  useDrawerPanelState,
  useDrawerSheetSnap,
  useDrawerTargetGeometry,
} from 'shared/ui/DrawerShell';
import classes from './GlobeScene.module.css';
import { deriveGlobeMotionPolicy } from './model/globeMotionPolicy';
import { deriveGlobeSceneMode } from './model/globeSceneMode';
import { deriveMapCameraInsets, resolveFrozenInsetPx } from './model/mapCameraInsets';
import { getOverviewMapBounds } from './model/overviewBoundsStrategy';
import { useAppVisibility } from 'shared/model/appVisibility';

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
  const { markMapReady, markMapFailed, markMapLoading, mapAttempt } = useFirstVisitMapReadiness();
  const handleMapError = useCallback((failure: MapLoadFailure) => {
    if (failure.fatal) markMapFailed();
  }, [markMapFailed]);
  useEffect(() => markMapLoading, [markMapLoading]);
  const mapSpots = useMemo<MapSpotProjection[]>(
    () => spots.map(({ id, slug, name, coords, status }) => ({ id, slug, name, coords, status })),
    [spots],
  );
  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const tempPin = useAddSpotStore((s) => s.tempPin);
  const setTempPin = useAddSpotStore((s) => s.setTempPin);
  const [isUserExploring, setIsUserExploring] = useState(false);
  const isDocumentHidden = useDocumentHidden();
  const isAppVisible = useAppVisibility();
  const { prefersReducedMotion } = useViewportCapabilities();
  const { layoutViewportWidthPx: viewportWidthPx, layoutViewportHeightPx: viewportHeightPx } = useViewportMetrics();
  const setBrowsingPanelExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryPanelExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const matches = useMatches();
  const routeIntent = resolveAppRouteIntent(
    matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const isImmersiveMapInput = routeIntent === 'immersiveMapInput';
  const layoutPolicy = useAppShellLayoutPolicy();
  const {
    mode: browseSurfaceMode,
    showResults: showBrowseResults,
  } = useBrowseSurface();
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
  const spotGalleryMatch = matches.find((match) => match.routeId === '/_panel/$spotId/gallery');
  const allGalleryMatch = matches.find((match) => match.routeId === '/_panel/gallery');
  // The map highlights/focuses a marker by database id, but the route's $spotId
  // param is a slug — read the already-resolved spot off the match's loaderData
  // instead of re-deriving an id from the slug.
  const routeSelectedSpotId = (spotMatch?.loaderData as Spot | undefined)?.id ?? null;
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
    isDocumentHidden: isDocumentHidden || !isAppVisible,
    prefersReducedMotion,
  });
  const interactionPolicy = layoutPolicy.map.interaction === 'hidden'
    ? 'background'
    : layoutPolicy.map.interaction;
  const drawerGeometry = useDrawerGeometry();
  const drawerTargetGeometry = useDrawerTargetGeometry();
  const sheetSnap = useDrawerSheetSnap();
  // The width the panel reports it is presenting — deliberately not the layout policy's
  // state, which is the *preference* that asked it to change. The preference flips a
  // render before the panel publishes the bounds it implies, so reading it here paired
  // "collapsed" with the still-expanded bounds for one frame and threw the camera onto
  // the expanded width before it settled back.
  const drawerPanelState = useDrawerPanelState();
  const isPersistentDrawer = layoutPolicy.drawer.presentation === 'persistent';
  const isPersistentDrawerExpanded = isPersistentDrawer && drawerPanelState === 'expanded';
  // Reads the preference rather than the panel's report, unlike the camera above: this
  // one *writes* the preference back (auto-compacting when the user grabs the map), so
  // it has to answer "is the preference expanded right now", and must hold even before
  // any panel has mounted and published a width.
  const canCompactPersistentDrawer = isPersistentDrawer
    && (layoutPolicy.drawer.state === 'expanded' || layoutPolicy.drawer.state === 'full');
  const cameraDrawerBounds = drawerTargetGeometry ?? drawerGeometry;
  const rawCameraInsetsPx = deriveMapCameraInsets({
    drawerBounds: cameraDrawerBounds,
    drawerPresentation: layoutPolicy.drawer.presentation,
    drawerChromeOnly: layoutPolicy.drawer.mapExclusive
      && browseSurfaceMode === 'map'
      && (routeIntent === 'browse' || routeIntent === 'galleryWorkspace'),
    viewportWidthPx,
    viewportHeightPx,
  });
  // The sheet's `full` snap covers nearly the whole viewport, so recentering the map as
  // it crosses into `full` is motion with no payoff (see resolveFrozenInsetPx).
  // Content-fitted sheets have no snap and use their live inset directly; feeding their
  // changing measured height into this render-time snap transition state can otherwise
  // make the scene schedule a new render for every measurement.
  const [frozenBottomInsetPx, setFrozenBottomInsetPx] = useState(rawCameraInsetsPx.bottom);
  const nextFrozenBottomInsetPx = resolveFrozenInsetPx(
    sheetSnap === 'full',
    rawCameraInsetsPx.bottom,
    frozenBottomInsetPx,
  );
  if (sheetSnap !== null && nextFrozenBottomInsetPx !== frozenBottomInsetPx) {
    setFrozenBottomInsetPx(nextFrozenBottomInsetPx);
  }
  // Desktop's persistent side panel has no sheet snap of its own, so it hits the same
  // "motion with no payoff" case above by expanding to its full width instead of crossing
  // into a `full` snap — held still while it presents that width instead. Null until a
  // collapsed width has actually been measured: loading straight into the expanded panel
  // has no earlier width to hold, and holding the pre-measurement zero would centre the
  // globe behind the panel rather than in the strip left beside it.
  const [frozenRightInsetPx, setFrozenRightInsetPx] = useState<number | null>(null);
  const holdCameraForPersistentDrawer = isPersistentDrawerExpanded && frozenRightInsetPx !== null;
  const nextFrozenRightInsetPx = resolveFrozenInsetPx(
    holdCameraForPersistentDrawer,
    rawCameraInsetsPx.right,
    frozenRightInsetPx ?? rawCameraInsetsPx.right,
  );
  if (isPersistentDrawer && cameraDrawerBounds !== null && nextFrozenRightInsetPx !== frozenRightInsetPx) {
    setFrozenRightInsetPx(nextFrozenRightInsetPx);
  }
  const cameraInsetsPx = {
    ...rawCameraInsetsPx,
    bottom: sheetSnap === 'full' ? frozenBottomInsetPx : rawCameraInsetsPx.bottom,
    right: nextFrozenRightInsetPx,
  };

  const handleSpotSelect = useCallback(async (spot: MapSpotProjection) => {
    if (isUpdatingWorkspace) return;

    if (sceneMode.kind !== 'uploadSpotSelection') {
      showBrowseResults();
      // The scope the photographer was already in owns spot selection: picking
      // a spot while browsing the gallery stays in the gallery, filtered to
      // that spot; picking one from sessions (or with no scope yet) lands on
      // that spot's session list, as before.
      await navigate({
        to: (allGalleryMatch || spotGalleryMatch) ? '/$spotId/gallery' : '/$spotId',
        params: { spotId: spot.slug },
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
  }, [
    allGalleryMatch,
    isUpdatingWorkspace,
    navigate,
    queryClient,
    sceneMode.kind,
    showBrowseResults,
    spotGalleryMatch,
    trpc,
    updateWorkspace,
    workspaceId,
  ]);

  const handleMapCoordinateClick = useCallback((coords: LngLat) => {
    setTempPin(coords);
  }, [setTempPin]);

  // Mirrors handleSpotSelect's scope-aware navigation: leaving the spot keeps
  // whichever browse section (gallery vs. sessions) was already showing.
  const handleClearSelectedSpot = useCallback(() => {
    void navigate({ to: (allGalleryMatch || spotGalleryMatch) ? '/gallery' : '/' });
  }, [allGalleryMatch, navigate, spotGalleryMatch]);

  const handleCameraGestureStart = useCallback(() => {
    if (!canCompactPersistentDrawer) return;

    if (routeIntent === 'galleryWorkspace') {
      setGalleryPanelExpanded(false);
    } else if (routeIntent === 'browse') {
      setBrowsingPanelExpanded(false);
    }
  }, [canCompactPersistentDrawer, routeIntent, setBrowsingPanelExpanded, setGalleryPanelExpanded]);

  return (
    <div className={classes.root}>
      <GlobeMap
        key={mapAttempt}
        spots={mapSpots}
        selectedSpotId={selectedSpotId}
        onSpotSelect={handleSpotSelect}
        motionPolicy={motionPolicy}
        interactionPolicy={interactionPolicy}
        selectedSpotFocusEnabled={sheetSnap !== 'full' && !isPersistentDrawerExpanded}
        cameraInsetsPx={cameraInsetsPx}
        isCoordinatePickerActive={isImmersiveMapInput}
        tempPin={tempPin}
        onMapCoordinateClick={handleMapCoordinateClick}
        onUserExploreStart={() => setIsUserExploring(true)}
        onUserExploreEnd={() => setIsUserExploring(false)}
        onMapReady={markMapReady}
        onMapError={handleMapError}
        onCameraGestureStart={handleCameraGestureStart}
        renderSelectedSpotContent={(spot) => <FavoriteSpotButton spotId={spot.id} />}
        onClearSelectedSpot={sceneMode.kind === 'uploadSpotSelection' ? undefined : handleClearSelectedSpot}
      />
      {isUpdatingWorkspace && (
        <div className={`${classes.saveStatus} ${materialClasses.status}`} role="status">Saving spot…</div>
      )}
      {isImmersiveMapInput && (
        <Suspense fallback={null}>
          <LazyAddSpotPanel />
        </Suspense>
      )}
    </div>
  );
}
