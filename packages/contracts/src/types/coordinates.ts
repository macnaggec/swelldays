/** Geographic position with explicit named axes. */
export type Position = { lat: number; lng: number };

/**
 * Geographic coordinates in [longitude, latitude] format (Mapbox standard).
 * Used for Mapbox-native APIs (tempPin, LocationPicker, reverse geocode).
 * Domain entity coords use Position instead.
 */
export type LngLat = [lng: number, lat: number];

/** Price in integer cents (e.g. 300 = $3.00). */
export type Cents = number;
