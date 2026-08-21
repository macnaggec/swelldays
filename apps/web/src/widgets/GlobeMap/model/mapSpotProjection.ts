import type { Spot } from 'entities/Spot';

/**
 * GlobeMap receives only the spot fields needed for map rendering and
 * interaction, then derives render-only GeoJSON inside the map adapter.
 */
export type MapSpotProjection = Pick<Spot, 'id' | 'name' | 'coords' | 'status'>;
