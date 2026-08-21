import type { LngLat } from '@wave-atlas/contracts';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string;

interface MapboxGeocodeResponse {
  features: { place_name: string }[];
}

const MAPBOX_BASE = 'https://api.mapbox.com';

function buildReverseGeocodeUrl(lng: number, lat: number): string {
  const url = new URL(`/geocoding/v5/mapbox.places/${lng},${lat}.json`, MAPBOX_BASE);
  url.searchParams.set('types', 'place,region,country');
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  return url.toString();
}

// TODO: route through a centralised HTTP client so non-2xx responses are
// logged/reported consistently (currently swallowed as '' since geocoding is best-effort).
export async function fetchReverseGeocode([lng, lat]: LngLat): Promise<string> {
  const res = await fetch(buildReverseGeocodeUrl(lng, lat));
  if (!res.ok) return '';
  const data = await res.json() as MapboxGeocodeResponse;
  return data.features[0]?.place_name ?? '';
}
