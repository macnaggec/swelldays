import { useRef, useCallback, useState, useMemo, useEffect, type ReactNode } from 'react';
import Map, { MapRef, Source, Layer, Popup, ViewStateChangeEvent, MapMouseEvent } from 'react-map-gl';
import { Loader, Paper, Text } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { webConfig } from 'config/env';

import type { LngLat } from '@swelldays/contracts/core';
import { useMapStore } from 'widgets/GlobeMap/model/mapStore';
import type { GlobeMotionPolicy } from './model/globeMotionPolicy';
import type { GlobeInteractionPolicy } from './model/globeInteractionPolicy';
import type { MapSpotProjection } from './model/mapSpotProjection';
import { NO_MAP_CAMERA_INSETS, type MapCameraInsets } from './model/mapCameraInsets';
import { useGlobeAnimation } from './hooks/useGlobeAnimation';
import { useSpotGeoJson } from './hooks/useSpotGeoJson';
import { useMapInteraction } from './hooks/useMapInteraction';
import { useMapImages } from './hooks/useMapImages';
import { TempPinMarker } from './ui/TempPinMarker';
import { SelectedSpotPopup } from './ui/SelectedSpotPopup';
import {
  clusterHaloLayer,
  clusterLayer,
  clusterCountLayer,
  unclusteredPointHaloLayer,
  unclusteredPointShadowLayer,
  unclusteredPointLayer,
  iconLayer,
  selectedSpotGlowLayer,
  selectedSpotShadowLayer,
  selectedSpotPointLayer,
  selectedSpotIconLayer,
  globeFog,
  SPOT_INTERACTIVE_LAYERS,
} from './layerStyles';

import classes from './GlobeMap.module.css';
import { classifyMapLoadFailure, type MapLoadFailure } from './model/mapLoadFailure';

const MAPBOX_TOKEN = webConfig.mapboxAccessToken;
if (!MAPBOX_TOKEN) throw new Error('Missing VITE_MAPBOX_ACCESS_TOKEN');

const DEFAULT_VIEW = {
  longitude: 115.085,
  latitude: -8.815,
  zoom: 1.5,
};

export interface GlobeMapHandle {
  flyTo: (center: [number, number], zoom?: number) => void;
}

interface PendingFocus {
  spotId: string;
}

export interface GlobeMapProps {
  spots?: MapSpotProjection[];
  selectedSpotId?: string | null;
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  onSpotSelect: (spot: MapSpotProjection) => void;
  motionPolicy: GlobeMotionPolicy;
  interactionPolicy?: GlobeInteractionPolicy;
  /** Whether route-driven selected-spot changes may move the camera. */
  selectedSpotFocusEnabled?: boolean;
  /** Px of the map canvas covered by app chrome per edge — reserved as camera padding so a focused spot centers in the visible map area. */
  cameraInsetsPx?: MapCameraInsets;
  isCoordinatePickerActive?: boolean;
  tempPin?: LngLat | null;
  onMapCoordinateClick?: (coords: LngLat) => void;
  onUserExploreStart?: () => void;
  onUserExploreEnd?: () => void;
  /** Reports that Mapbox has completed its initial visual load. */
  onMapReady?: () => void;
  onMapError?: (failure: MapLoadFailure) => void;
  /** Reports the start of genuine camera movement, excluding clicks and pointer-down alone. */
  onCameraGestureStart?: () => void;
  /** Feature-owned content (e.g. a favorite toggle) rendered in the selected-spot popup — GlobeMap stays feature-agnostic. */
  renderSelectedSpotContent?: (spot: MapSpotProjection) => ReactNode;
  /** Clears the spot selection, shown as a close control on the selected-spot popup. Omit to hide the control. */
  onClearSelectedSpot?: () => void;
}

export function GlobeMapComponent({
  spots = [],
  selectedSpotId = null,
  initialViewState: _initialViewState = DEFAULT_VIEW,
  onSpotSelect,
  motionPolicy,
  interactionPolicy = 'interactive',
  selectedSpotFocusEnabled = true,
  cameraInsetsPx = NO_MAP_CAMERA_INSETS,
  isCoordinatePickerActive = false,
  tempPin = null,
  onMapCoordinateClick,
  onUserExploreStart,
  onUserExploreEnd,
  onMapReady,
  onMapError,
  onCameraGestureStart,
  renderSelectedSpotContent,
  onClearSelectedSpot,
}: GlobeMapProps) {
  // Destructured into value primitives so effect and callback dependencies stay
  // value-based — a fresh insets object per parent render must never restart a camera
  // flight.
  const { top: insetTopPx, right: insetRightPx, bottom: insetBottomPx, left: insetLeftPx } = cameraInsetsPx;
  const mapRef = useRef<MapRef>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const appliedInsetsKeyRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const cameraState = useMapStore((s) => s.cameraState);
  const saveCameraState = useMapStore((s) => s.saveCameraState);
  // Gates camera movement only (pan/zoom/rotate/scroll). Spot clicks and the popup stay
  // available even while backgrounded (e.g. sidebar expanded) — see acceptsSpotInteraction.
  const acceptsCameraGestures = interactionPolicy === 'interactive';
  const acceptsSpotInteraction = !isCoordinatePickerActive && interactionPolicy !== 'decorative';

  // On hard nav to a spot URL with no prior session (camera at default Bali position),
  // derive the initial viewport from the spot coords at zoom 12 — same as the soft-nav
  // flyTo would produce. A lazy state initializer captures it once at mount, matching
  // how react-map-gl treats initialViewState (ignored after first render).
  const [{ viewState: resolvedInitialView, focusedSpotId: initialFocusedSpotId }] = useState(() => {
    const isDefaultCamera =
      cameraState.longitude === DEFAULT_VIEW.longitude &&
      cameraState.latitude === DEFAULT_VIEW.latitude;
    if (isDefaultCamera && selectedSpotFocusEnabled && selectedSpotId) {
      const spot = spots.find((s) => s.id === selectedSpotId);
      if (spot) {
        return {
          viewState: {
            longitude: spot.coords.lng,
            latitude: spot.coords.lat,
            zoom: 12,
            pitch: 0,
            bearing: 0,
          },
          focusedSpotId: null,
        };
      }
    }
    return {
      viewState: cameraState,
      focusedSpotId: null,
    };
  });
  const appliedFocusKeyRef = useRef<string | null>(initialFocusedSpotId);

  const {
    startSpinning,
    stopSpinning,
    onUserInteractionStart,
    onUserInteractionEnd,
  } = useGlobeAnimation(mapRef, {
    spinSpeed: 0.3,
    enabled: motionPolicy === 'ambientSpin',
    maxSpinZoom: 3,
  });

  const selectedSpot = useMemo(
    () => (selectedSpotId ? spots.find((s) => s.id === selectedSpotId) ?? null : null),
    [spots, selectedSpotId]
  );

  // Excluded from the clustered source so it can never be folded into a cluster while
  // zooming out — it's rendered separately below via an always-unclustered source, so
  // its popup stays anchored to an individually visible spot instead of a cluster.
  const clusterableSpots = useMemo(
    () => (selectedSpotId ? spots.filter((s) => s.id !== selectedSpotId) : spots),
    [spots, selectedSpotId]
  );
  const spotsGeoJson = useSpotGeoJson(clusterableSpots);
  const selectedSpotList = useMemo(() => (selectedSpot ? [selectedSpot] : []), [selectedSpot]);
  const selectedSpotGeoJson = useSpotGeoJson(selectedSpotList);
  const { loadImages } = useMapImages(mapRef);

  const executeFocusSpot = useCallback((spot: MapSpotProjection) => {
    const map = mapInstanceRef.current;
    if (!map) {
      pendingFocusRef.current = { spotId: spot.id };
      return;
    }

    const currentZoom = map.getZoom();
    const padding = {
      top: insetTopPx,
      right: insetRightPx,
      bottom: insetBottomPx,
      left: insetLeftPx,
    };
    appliedInsetsKeyRef.current = [insetTopPx, insetRightPx, insetBottomPx, insetLeftPx].join(':');
    const center: [number, number] = [spot.coords.lng, spot.coords.lat];
    const skipAnimation = motionPolicy === 'disabled';

    if (currentZoom >= 12) {
      map.easeTo({
        center,
        padding,
        duration: skipAnimation ? 0 : 600,
        essential: true,
      });
      return;
    }

    map.flyTo({
      center,
      zoom: 12,
      padding,
      duration: skipAnimation ? 0 : 1000,
      essential: true,
    });
  }, [insetTopPx, insetRightPx, insetBottomPx, insetLeftPx, motionPolicy]);

  const focusSpotById = useCallback((spotId: string) => {
    const spot = spots.find((candidate) => candidate.id === spotId);
    if (!spot) return false;

    executeFocusSpot(spot);
    if (mapInstanceRef.current) {
      pendingFocusRef.current = null;
    }
    return true;
  }, [executeFocusSpot, spots]);

  const {
    hoveredSpot,
    cursor,
    onMapClick: onSpotClick,
    onMouseEnter,
    onMouseLeave
  } = useMapInteraction({
    mapRef,
    spots,
    onSpotClick: acceptsSpotInteraction
      ? (spot) => {
        // Already selected: the camera is already correctly focused against the live
        // shell insets. Re-running is unnecessary, so only focus a different spot.
        if (spot.id !== selectedSpotId) {
          executeFocusSpot(spot);
        }
        onSpotSelect(spot);
      }
      : undefined,
    onUserInteractionStart: acceptsSpotInteraction
      ? () => {
        onUserExploreStart?.();
        onUserInteractionStart();
      }
      : () => { },
  });

  useEffect(() => {
    if (!selectedSpotId) {
      pendingFocusRef.current = null;
      appliedFocusKeyRef.current = null;
      return;
    }
    if (!selectedSpotFocusEnabled) {
      pendingFocusRef.current = null;
      return;
    }

    const focusKey = [
      selectedSpotId,
      insetTopPx,
      insetRightPx,
      insetBottomPx,
      insetLeftPx,
    ].join(':');
    if (appliedFocusKeyRef.current === focusKey) return;

    if (focusSpotById(selectedSpotId)) {
      appliedFocusKeyRef.current = focusKey;
    }
  }, [
    focusSpotById,
    insetBottomPx,
    insetLeftPx,
    insetRightPx,
    insetTopPx,
    selectedSpotId,
    selectedSpotFocusEnabled,
  ]);

  // With no spot focused, the map has no other reason to reserve the chrome's
  // covered edge as camera padding — without this, the globe centers on the
  // full canvas and renders visually off-center within the space actually
  // left free by the side panel.
  useEffect(() => {
    if (!isLoaded) return;
    if (selectedSpotId && selectedSpotFocusEnabled) return;

    const map = mapInstanceRef.current;
    if (!map) return;
    const padding = {
      top: insetTopPx,
      right: insetRightPx,
      bottom: insetBottomPx,
      left: insetLeftPx,
    };
    const key = [insetTopPx, insetRightPx, insetBottomPx, insetLeftPx].join(':');
    if (appliedInsetsKeyRef.current === key) return;

    if (appliedInsetsKeyRef.current === null) {
      map.setPadding(padding);
    } else {
      // Match the sheet's 280ms settling time without moving or zooming the camera.
      map.easeTo({ padding, duration: motionPolicy === 'disabled' ? 0 : 280, essential: true });
    }
    appliedInsetsKeyRef.current = key;
  }, [
    isLoaded,
    motionPolicy,
    insetTopPx,
    insetRightPx,
    insetBottomPx,
    insetLeftPx,
    selectedSpotId,
    selectedSpotFocusEnabled,
  ]);

  useEffect(() => {
    return () => {
      mapInstanceRef.current = null;
      pendingFocusRef.current = null;
    };
  }, []);

  const handleMoveEnd = useCallback((e: ViewStateChangeEvent) => {
    const { longitude, latitude, zoom, pitch, bearing } = e.viewState;
    saveCameraState({ longitude, latitude, zoom, pitch, bearing });
    if (!acceptsCameraGestures) return;

    onUserExploreEnd?.();
  }, [acceptsCameraGestures, onUserExploreEnd, saveCameraState]);

  const handleUserInteractionStart = useCallback(() => {
    if (!acceptsCameraGestures) return;

    onUserExploreStart?.();
    onUserInteractionStart();
  }, [acceptsCameraGestures, onUserExploreStart, onUserInteractionStart]);

  const handleCameraGestureStart = useCallback((event: ViewStateChangeEvent) => {
    if (!acceptsCameraGestures) return;
    if (!event.originalEvent) return;

    onCameraGestureStart?.();
    handleUserInteractionStart();
  }, [acceptsCameraGestures, handleUserInteractionStart, onCameraGestureStart]);

  const handleUserInteractionEnd = useCallback(() => {
    if (!acceptsCameraGestures) return;

    onUserInteractionEnd();
    onUserExploreEnd?.();
  }, [acceptsCameraGestures, onUserExploreEnd, onUserInteractionEnd]);

  const handleLoad = useCallback((e: mapboxgl.MapboxEvent) => {
    mapInstanceRef.current = e.target as mapboxgl.Map;
    setIsLoaded(true);
    loadImages();
    onMapReady?.();

    const pendingFocus = pendingFocusRef.current;
    if (pendingFocus) {
      focusSpotById(pendingFocus.spotId);
    }
  }, [focusSpotById, loadImages, onMapReady]);

  const handleCoordinateClick = useCallback((e: MapMouseEvent) => {
    onMapCoordinateClick?.([e.lngLat.lng, e.lngLat.lat]);
  }, [onMapCoordinateClick]);

  useEffect(() => {
    if (!isLoaded) return;

    if (motionPolicy === 'ambientSpin') {
      startSpinning();
      return;
    }

    stopSpinning();
  }, [isLoaded, motionPolicy, startSpinning, stopSpinning]);

  return (
    <div
      className={classes.globeContainer}
      aria-hidden={interactionPolicy === 'decorative' || undefined}
      inert={interactionPolicy === 'decorative'}
    >
      {!isLoaded && (
        <div className={classes.loading}>
          <Loader color="blue" size="lg" />
        </div>
      )}

      <Map
        ref={mapRef}
        cursor={isCoordinatePickerActive ? 'crosshair' : (!acceptsCameraGestures ? 'default' : cursor)}
        interactive={true}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={resolvedInitialView}
        onMoveEnd={handleMoveEnd}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mapbox-gl type for globe projection requires any
        projection={{ name: 'globe' as any }}
        fog={globeFog}
        onLoad={handleLoad}
        onError={(event) => {
          if (mapInstanceRef.current) return;
          const failure = classifyMapLoadFailure(event.error);
          // react-map-gl uses a null target when constructing Mapbox itself failed.
          onMapError?.({ ...failure, fatal: event.target === null || failure.fatal });
        }}
        onClick={isCoordinatePickerActive ? handleCoordinateClick : (acceptsSpotInteraction ? onSpotClick : undefined)}
        onDragStart={acceptsCameraGestures ? handleCameraGestureStart : undefined}
        onDragEnd={acceptsCameraGestures ? handleUserInteractionEnd : undefined}
        onZoomStart={acceptsCameraGestures ? handleCameraGestureStart : undefined}
        onZoomEnd={acceptsCameraGestures ? handleUserInteractionEnd : undefined}
        onRotateStart={acceptsCameraGestures ? handleCameraGestureStart : undefined}
        onRotateEnd={acceptsCameraGestures ? handleUserInteractionEnd : undefined}
        onMouseDown={acceptsCameraGestures ? handleUserInteractionStart : undefined}
        onTouchStart={acceptsCameraGestures ? handleUserInteractionStart : undefined}
        onWheel={acceptsCameraGestures ? handleUserInteractionStart : undefined}
        interactiveLayerIds={acceptsSpotInteraction ? SPOT_INTERACTIVE_LAYERS : []}
        onMouseEnter={acceptsSpotInteraction ? onMouseEnter : undefined}
        onMouseLeave={acceptsSpotInteraction ? onMouseLeave : undefined}
        scrollZoom={acceptsCameraGestures}
        boxZoom={acceptsCameraGestures}
        dragRotate={acceptsCameraGestures}
        dragPan={acceptsCameraGestures}
        keyboard={acceptsCameraGestures}
        doubleClickZoom={acceptsCameraGestures}
        touchZoomRotate={acceptsCameraGestures}
        touchPitch={acceptsCameraGestures}
        maxZoom={18}
        minZoom={1}
        trackResize={true}
        cooperativeGestures={false}
      >
        <Source
          id="spots"
          type="geojson"
          data={spotsGeoJson}
          cluster={true}
          clusterMaxZoom={11}
          clusterRadius={50}
        >
          <Layer key={clusterHaloLayer.id} {...clusterHaloLayer} />
          <Layer key={clusterLayer.id} {...clusterLayer} />
          <Layer key={clusterCountLayer.id} {...clusterCountLayer} />
          <Layer key={unclusteredPointHaloLayer.id} {...unclusteredPointHaloLayer} />
          <Layer key={unclusteredPointShadowLayer.id} {...unclusteredPointShadowLayer} />
          <Layer key={unclusteredPointLayer.id} {...unclusteredPointLayer} />
          <Layer key={iconLayer.id} {...iconLayer} />
        </Source>
        <Source id="selected-spot" type="geojson" data={selectedSpotGeoJson}>
          <Layer key={selectedSpotGlowLayer.id} {...selectedSpotGlowLayer} />
          <Layer key={selectedSpotShadowLayer.id} {...selectedSpotShadowLayer} />
          <Layer key={selectedSpotPointLayer.id} {...selectedSpotPointLayer} />
          <Layer key={selectedSpotIconLayer.id} {...selectedSpotIconLayer} />
        </Source>
        {/* Tooltip Popup (Only when not selected) */}
        {acceptsSpotInteraction && hoveredSpot && hoveredSpot.id !== selectedSpotId && (
          <Popup
            longitude={hoveredSpot.coords.lng}
            latitude={hoveredSpot.coords.lat}
            offset={20}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            className={classes.popupTooltip}
          >
            <Paper
              className={materialClasses.chrome}
              p="xs"
              shadow="xs"
              radius="lg"
              withBorder
            >
              <Text size="sm" fw={500}>
                {hoveredSpot.name}
              </Text>
            </Paper>
          </Popup>
        )}

        {acceptsSpotInteraction && selectedSpot && (
          <SelectedSpotPopup
            spot={selectedSpot}
            renderExtra={renderSelectedSpotContent}
            onClear={onClearSelectedSpot}
          />
        )}

        <TempPinMarker
          tempPin={tempPin}
          isActive={isCoordinatePickerActive}
        />
      </Map>
    </div>
  );
}

export default GlobeMapComponent;
