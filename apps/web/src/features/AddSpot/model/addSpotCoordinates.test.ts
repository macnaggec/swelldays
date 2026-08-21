import { describe, expect, it } from 'vitest';
import { toCreateSpotCoordinates } from './addSpotCoordinates';

describe('toCreateSpotCoordinates', () => {
  it('translates the map click LngLat tuple into named create-spot coordinates', () => {
    expect(toCreateSpotCoordinates([151.2, -33.85])).toEqual({
      lat: -33.85,
      lng: 151.2,
    });
  });
});
