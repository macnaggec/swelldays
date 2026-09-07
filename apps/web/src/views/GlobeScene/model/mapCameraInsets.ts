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
 *
 * Desktop's persistent side panel has no sheet snap of its own, but hits the same
 * "motion with no payoff" case when it expands to its full width — so its `right`
 * inset is frozen through the same function, gated on the width the panel reports it
 * is presenting instead of a snap value.
 */
export function resolveFrozenInsetPx(
  shouldFreeze: boolean,
  rawInsetPx: number,
  previousFrozenInsetPx: number,
): number {
  return shouldFreeze ? previousFrozenInsetPx : rawInsetPx;
}
