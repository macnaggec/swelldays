import { describe, expect, it } from 'vitest';
import { resolveAppRouteIntent } from './appRouteIntent';

describe('resolveAppRouteIntent', () => {
  it('defaults routes without declared intent to browse', () => {
    expect(resolveAppRouteIntent([{}])).toBe('browse');
  });

  it('uses the deepest declared route intent', () => {
    expect(resolveAppRouteIntent([
      { staticData: { appRouteIntent: 'browse' } },
      { staticData: { appRouteIntent: 'routeWorkspace' } },
      {},
    ])).toBe('routeWorkspace');
  });

  it('keeps gallery and route workspaces distinct', () => {
    expect(resolveAppRouteIntent([
      { staticData: { appRouteIntent: 'browse' } },
      { staticData: { appRouteIntent: 'galleryWorkspace' } },
    ])).toBe('galleryWorkspace');
  });

  it('classifies route-driven map input separately from immersive map input', () => {
    const matches = [
      { staticData: { appRouteIntent: 'browse' as const } },
      { staticData: { appRouteIntent: 'mapInput' as const } },
    ];

    expect(resolveAppRouteIntent(matches)).toBe('mapInput');
    expect(resolveAppRouteIntent(matches, 'immersiveMapInput')).toBe('immersiveMapInput');
  });

  it('keeps a declared full-page route authoritative over runtime map input', () => {
    expect(resolveAppRouteIntent([
      { staticData: { appRouteIntent: 'fullPage' } },
      {},
    ], 'immersiveMapInput')).toBe('fullPage');
  });
});
