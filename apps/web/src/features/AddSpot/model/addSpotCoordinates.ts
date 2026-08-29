import type { LngLat } from '@swelldays/contracts/core';

export interface CreateSpotCoordinates {
  lat: number;
  lng: number;
}

export function toCreateSpotCoordinates([lng, lat]: LngLat): CreateSpotCoordinates {
  return { lat, lng };
}
