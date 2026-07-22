import { describe, expect, it } from 'vitest';
import { deriveGlobeSceneMode } from './globeSceneMode';

describe('deriveGlobeSceneMode', () => {
  it('names Add Spot before route or upload selection modes', () => {
    expect(deriveGlobeSceneMode({
      routeIntent: 'immersiveMapInput',
      selectedSpotId: 'spot-1',
      isUserExploring: false,
    })).toEqual({ kind: 'addSpotFlow' });
  });

  it('names upload spot selection before focused spot routes', () => {
    expect(deriveGlobeSceneMode({
      routeIntent: 'mapInput',
      selectedSpotId: 'spot-1',
      isUserExploring: false,
    })).toEqual({ kind: 'uploadSpotSelection' });
  });

  it('names focused spot routes with the selected spot id', () => {
    expect(deriveGlobeSceneMode({
      routeIntent: 'browse',
      selectedSpotId: 'spot-1',
      isUserExploring: false,
    })).toEqual({ kind: 'spotFocused', spotId: 'spot-1' });
  });

  it('names active map exploration before the overview mode', () => {
    expect(deriveGlobeSceneMode({
      routeIntent: 'browse',
      selectedSpotId: null,
      isUserExploring: true,
    })).toEqual({ kind: 'userExploring' });
  });

  it('names the default mode as overview', () => {
    expect(deriveGlobeSceneMode({
      routeIntent: 'browse',
      selectedSpotId: null,
      isUserExploring: false,
    })).toEqual({ kind: 'overview' });
  });
});
