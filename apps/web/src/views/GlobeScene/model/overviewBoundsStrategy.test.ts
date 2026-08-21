import { describe, expect, it } from 'vitest';
import { getOverviewMapBounds } from './overviewBoundsStrategy';

describe('getOverviewMapBounds', () => {
  it('uses full-world bounds for the temporary overview read strategy', () => {
    expect(getOverviewMapBounds()).toEqual({
      swLat: -90,
      swLng: -180,
      neLat: 90,
      neLng: 180,
    });
  });
});
