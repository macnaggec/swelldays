import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LngLat } from '@wave-atlas/contracts';
import { fetchReverseGeocode } from 'shared/api/mapbox';

interface UseReverseGeocodeResult {
  location: string;
  isLoading: boolean;
  geocode: (position: LngLat) => void;
  setLocation: (value: string) => void;
}

/**
 * useReverseGeocode — resolves a [lng, lat] pin to a human-readable location string
 * using the Mapbox Geocoding API.
 *
 * Returns `isLoading` for spinner feedback and `setLocation` so the user can
 * override the auto-filled value manually.
 */
export function useReverseGeocode(): UseReverseGeocodeResult {
  const [coords, setCoords] = useState<LngLat | null>(null);
  // Manual override wins over geocoded result (null = use geocoded)
  const [locationOverride, setLocationOverride] = useState<string | null>(null);

  const { data: geocodedLocation = '', isFetching } = useQuery({
    queryKey: ['geocode', coords],
    queryFn: () => fetchReverseGeocode(coords!),
    enabled: !!coords,
    staleTime: Infinity, // coordinates never geocode differently
  });

  const geocode = useCallback((position: LngLat) => {
    setCoords(position);
    setLocationOverride(null);
  }, []);

  const setLocation = useCallback((value: string) => {
    setLocationOverride(value);
  }, []);

  return {
    location: locationOverride ?? geocodedLocation,
    isLoading: isFetching,
    geocode,
    setLocation,
  };
}
