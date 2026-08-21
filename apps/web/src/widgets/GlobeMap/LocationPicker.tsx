

import { useRef, useCallback, useState } from 'react';
import Map, { MapRef, Marker, NavigationControl, MapLayerMouseEvent } from 'react-map-gl';
import { Loader } from '@mantine/core';
import 'mapbox-gl/dist/mapbox-gl.css';
import { webConfig } from 'config/env';

import { LngLat } from '@swelldays/contracts';
import globeClasses from './GlobeMap.module.css';
import classes from './LocationPicker.module.css';

const MAPBOX_TOKEN = webConfig.mapboxAccessToken;

export interface LocationPickerProps {
  /** Current selected position [lng, lat] */
  position: LngLat | null;
  /** Callback when position is selected */
  onPositionChange: (position: LngLat) => void;
  /** Initial map center [lng, lat] */
  initialCenter?: LngLat;
  /** Initial zoom level */
  initialZoom?: number;
}

/**
 * LocationPicker - Click-to-place marker component using Mapbox
 *
 * Used in spot creation flow to select a location on the map.
 * Uses flat projection (not globe) for better precision when picking locations.
 */
export function LocationPicker({
  position,
  onPositionChange,
  initialCenter = [115.085, -8.815], // Bali default
  initialZoom = 10,
}: LocationPickerProps) {
  const mapRef = useRef<MapRef>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const handleMapClick = useCallback((event: MapLayerMouseEvent) => {
    const { lng, lat } = event.lngLat;
    onPositionChange([lng, lat]);
  }, [onPositionChange]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className={classes.errorState}>
        Missing VITE_MAPBOX_ACCESS_TOKEN
      </div>
    );
  }

  return (
    <div className={classes.container}>
      {!isLoaded && (
        <div className={classes.loading}>
          <Loader color="blue" size="lg" />
        </div>
      )}

      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{
          longitude: initialCenter[0],
          latitude: initialCenter[1],
          zoom: initialZoom,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
        onClick={handleMapClick}
        onLoad={handleLoad}
        cursor="crosshair"
      >
        <NavigationControl position="top-right" />

        {position && (
          <Marker
            longitude={position[0]}
            latitude={position[1]}
            anchor="bottom"
          >
            <div className={`${globeClasses.spotMarker} ${classes.marker}`} />
          </Marker>
        )}
      </Map>
    </div>
  );
}

export default LocationPicker;
