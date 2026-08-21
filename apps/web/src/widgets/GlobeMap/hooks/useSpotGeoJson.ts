import { useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { SPOT_STATUS } from 'entities/Spot';
import type { MapSpotProjection } from '../model/mapSpotProjection';

export const useSpotGeoJson = (spots: MapSpotProjection[]): FeatureCollection => {
  return useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: spots.map(spot => ({
        type: 'Feature',
        properties: {
          ...spot,
          isUnverified: spot.status === SPOT_STATUS.UNVERIFIED
        },
        geometry: {
          type: 'Point',
          coordinates: [spot.coords.lng, spot.coords.lat]
        }
      }))
    };
  }, [spots]);
};
