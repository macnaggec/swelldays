import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import type { DrawerGeometry } from 'shared/ui/DrawerShell';
import { NO_MAP_CAMERA_INSETS, type MapCameraInsets } from 'widgets/GlobeMap';

export interface MapCameraInsetsInput {
  drawerBounds: DrawerGeometry | null;
  drawerPresentation: AppShellLayoutPolicy['drawer']['presentation'];
  drawerChromeOnly?: boolean;
  viewportWidthPx: number;
  viewportHeightPx: number;
}

/** Clipped overlap of a measured edge pair with the viewport, rounded for Mapbox camera padding. */
function clippedOverlap(start: number, end: number, viewportExtentPx: number): number {
  const overlapStart = Math.max(0, start);
  const overlapEnd = Math.min(viewportExtentPx, end);
  return Math.max(0, Math.round(overlapEnd - overlapStart));
}

export function deriveMapCameraInsets({
  drawerBounds,
  drawerPresentation,
  drawerChromeOnly = false,
  viewportWidthPx,
  viewportHeightPx,
}: MapCameraInsetsInput): MapCameraInsets {
  if (!drawerBounds) return NO_MAP_CAMERA_INSETS;

  switch (drawerPresentation) {
    case 'persistent':
      return {
        top: 0,
        right: clippedOverlap(drawerBounds.left, drawerBounds.right, viewportWidthPx),
        bottom: 0,
        left: 0,
      };
    case 'sideOverlay':
      return drawerChromeOnly
        ? NO_MAP_CAMERA_INSETS
        : {
          top: 0,
          right: clippedOverlap(drawerBounds.left, drawerBounds.right, viewportWidthPx),
          bottom: 0,
          left: 0,
        };
    case 'bottomSheet':
      return {
        top: 0,
        right: 0,
        bottom: clippedOverlap(drawerBounds.top, drawerBounds.bottom, viewportHeightPx),
        left: 0,
      };
    case 'fullScreen':
    case 'hidden':
      return NO_MAP_CAMERA_INSETS;
  }
}
