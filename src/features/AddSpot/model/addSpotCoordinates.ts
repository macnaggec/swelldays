import type { LngLat } from '@wave-atlas/contracts';

export interface CreateSpotCoordinates {
  lat: number;
  lng: number;
}

export function toCreateSpotCoordinates([lng, lat]: LngLat): CreateSpotCoordinates {
  return { lat, lng };
}
