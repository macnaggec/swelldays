import { describe, expect, it } from 'vitest';
import { deriveDrawerViewportOcclusionPx } from './drawerViewportOcclusion';

describe('deriveDrawerViewportOcclusionPx', () => {
  it('reports no occlusion before the drawer has rendered', () => {
    expect(deriveDrawerViewportOcclusionPx({
      drawerBounds: null,
      viewportWidthPx: 2000,
    })).toBe(0);
  });

  it('clips the measured drawer bounds to their viewport overlap', () => {
    expect(deriveDrawerViewportOcclusionPx({
      drawerBounds: { left: 1200, right: 2100 },
      viewportWidthPx: 2000,
    })).toBe(800);
  });
});
