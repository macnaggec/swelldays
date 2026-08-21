import { useCallback, RefObject } from 'react';
import type mapboxgl from 'mapbox-gl';
import { getErrorMessage } from 'shared/lib/getErrorMessage';

interface MarkerImageMapRef {
  getMap(): Pick<mapboxgl.Map, 'addImage' | 'hasImage' | 'loadImage'>;
}

export const useMapImages = (mapRef: RefObject<MarkerImageMapRef | null>) => {
  const loadImages = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Use the larger android-chrome-192x192.png for better quality on the map
    map.loadImage('/android-chrome-192x192.png', (error, image) => {
      if (error) {
        console.error('Error loading map icon:', getErrorMessage(error));
        return;
      }
      if (image && !map.hasImage('custom-marker')) {
        map.addImage('custom-marker', image);
      }
    });
  }, [mapRef]);

  return { loadImages };
};
