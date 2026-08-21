import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import type { DrawerGeometry, SheetSnap } from 'shared/ui/DrawerShell';
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
    case 'sideWorkspace':
    case 'fullScreen':
    case 'hidden':
      return NO_MAP_CAMERA_INSETS;
  }
}

/**
 * The sheet's `full` snap covers all but a 24px strip of the viewport, so the pin the
 * bottom inset exists to keep clear of the sheet is about to be fully hidden anyway —
 * recentering as the sheet crosses into `full` is motion with no payoff, immediately
 * undone by the sheet covering it. Holding the prior inset keeps the map still through
 * that crossing; leaving `full` (back to `half` or `peek`) resumes following it.
 */
export function resolveFrozenBottomInsetPx(
  sheetSnap: SheetSnap | null,
  rawBottomInsetPx: number,
  previousFrozenBottomInsetPx: number,
): number {
  return sheetSnap === 'full' ? previousFrozenBottomInsetPx : rawBottomInsetPx;
}
