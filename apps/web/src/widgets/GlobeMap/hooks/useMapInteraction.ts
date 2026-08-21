import { useState, useCallback, RefObject, useRef, useEffect } from 'react';
import { MapRef, MapMouseEvent, GeoJSONSource } from 'react-map-gl';
import type { MapSpotProjection } from '../model/mapSpotProjection';

interface UseMapInteractionProps {
  mapRef: RefObject<MapRef | null>;
  spots: MapSpotProjection[];
  onSpotClick?: (spot: MapSpotProjection) => void;
  onClearSelection?: () => void;
  onUserInteractionStart: () => void;
}

export const useMapInteraction = ({
  mapRef,
  spots,
  onSpotClick,
  onClearSelection,
  onUserInteractionStart
}: UseMapInteractionProps) => {
  const [hoveredSpot, setHoveredSpot] = useState<MapSpotProjection | null>(null);
  const [cursor, setCursor] = useState<string>('');
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleBackgroundClick = useCallback(() => {
    onClearSelection?.();
  }, [onClearSelection]);

  const handleClusterClick = useCallback((clusterId: number, coordinates: [number, number]) => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const source = map.getSource('spots') as GeoJSONSource;
    source.getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err || zoom === null || zoom === undefined) return;

      map.easeTo({
        center: coordinates,
        zoom: zoom,
        duration: 500
      });
    });
  }, [mapRef]);

  const handleSpotClick = useCallback((spotId: string | number) => {
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return;
    onSpotClick?.(spot);
  }, [spots, onSpotClick]);

  const onMapClick = useCallback((event: MapMouseEvent) => {
    onUserInteractionStart();

    const feature = event.features?.[0];

    // Close active spot if clicking on empty map
    if (!feature) {
      handleBackgroundClick();
      return;
    }

    const clusterId = feature.properties?.cluster_id;

    if (clusterId && feature.geometry.type === 'Point') {
      handleClusterClick(clusterId, feature.geometry.coordinates as [number, number]);
      return;
    }

    const spotId = feature.properties?.id;
    if (spotId && feature.geometry.type === 'Point') {
      handleSpotClick(spotId);
    }
  }, [onUserInteractionStart, handleBackgroundClick, handleClusterClick, handleSpotClick]);

  const onMouseEnter = useCallback((event: MapMouseEvent) => {
    setCursor('pointer');

    // Clear any existing timer
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    const feature = event.features?.[0];
    if (feature && !feature.properties?.cluster) {
      const spotId = feature.properties?.id;
      if (spotId) {
        const spot = spots.find(s => s.id === spotId);
        if (spot) {
          // 1 second delay before showing tooltip
          hoverTimeoutRef.current = setTimeout(() => {
            setHoveredSpot(spot);
          }, 1000);
        }
      }
    }
  }, [spots]);

  const onMouseLeave = useCallback(() => {
    setCursor('');
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveredSpot(null);
  }, []);

  return {
    hoveredSpot,
    cursor,
    onMapClick,
    onMouseEnter,
    onMouseLeave
  };
};
