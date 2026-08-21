import type { MapBounds } from 'entities/Spot';

const TEMPORARY_FULL_WORLD_OVERVIEW_BOUNDS: MapBounds = {
  swLat: -90,
  swLng: -180,
  neLat: 90,
  neLng: 180,
};

/**
 * Temporary overview strategy: read every valid server-owned spot record for
 * the globe overview until viewport bounds or tiling replaces this function.
 */
export function getOverviewMapBounds(): MapBounds {
  return TEMPORARY_FULL_WORLD_OVERVIEW_BOUNDS;
}
