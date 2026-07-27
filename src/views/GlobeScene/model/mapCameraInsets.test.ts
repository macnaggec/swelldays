import { describe, expect, it } from 'vitest';
import { deriveMapCameraInsets } from './mapCameraInsets';

describe('deriveMapCameraInsets', () => {
  it('reports no insets before the drawer has rendered', () => {
    expect(deriveMapCameraInsets({
      drawerBounds: null,
      drawerPresentation: 'persistent',
      viewportWidthPx: 2000,
      viewportHeightPx: 900,
    })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('clips a persistent panel past the viewport right edge to the right inset', () => {
    expect(deriveMapCameraInsets({
      drawerBounds: { left: 1200, top: 0, right: 2100, bottom: 900, width: 900, height: 900 },
      drawerPresentation: 'persistent',
      viewportWidthPx: 2000,
      viewportHeightPx: 900,
    })).toEqual({ top: 0, right: 800, bottom: 0, left: 0 });
  });

  it('projects a sideOverlay panel to the same inline-end result as persistent', () => {
    expect(deriveMapCameraInsets({
      drawerBounds: { left: 1200, top: 0, right: 2100, bottom: 900, width: 900, height: 900 },
      drawerPresentation: 'sideOverlay',
      viewportWidthPx: 2000,
      viewportHeightPx: 900,
    })).toEqual({ top: 0, right: 800, bottom: 0, left: 0 });
  });

  it('clips a bottomSheet past the viewport bottom edge to the bottom inset', () => {
    expect(deriveMapCameraInsets({
      drawerBounds: { left: 0, top: 500, right: 390, bottom: 1000, width: 390, height: 500 },
      drawerPresentation: 'bottomSheet',
      viewportWidthPx: 390,
      viewportHeightPx: 900,
    })).toEqual({ top: 0, right: 0, bottom: 400, left: 0 });
  });

  it.each(['fullScreen', 'hidden'] as const)('reports no insets for %s even when bounds are present', (drawerPresentation) => {
    expect(deriveMapCameraInsets({
      drawerBounds: { left: 1200, top: 0, right: 2100, bottom: 900, width: 900, height: 900 },
      drawerPresentation,
      viewportWidthPx: 2000,
      viewportHeightPx: 900,
    })).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });
});
