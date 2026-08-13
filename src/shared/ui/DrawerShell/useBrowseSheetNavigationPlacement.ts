import { useMemo } from 'react';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { useDrawerDragging, useDrawerGeometry } from './geometry';
import {
  resolveBrowseSheetNavigationOpacity,
  resolveBrowseSheetPeekHeightPx,
  resolveSheetSnapHeights,
  type SheetSnap,
} from './sheetSnapPolicy';

export interface BrowseSheetNavigationPlacement {
  /** Top edge, in viewport px, the plate should align itself beside. */
  topPx: number;
  /** 1 fully visible, 0 fully faded. Monotonic as the sheet rises or falls. */
  opacity: number;
  /** True once the plate must be inert and hidden from accessibility. */
  hidden: boolean;
  /** True while `topPx` is a live drag sample rather than the resting snap position. */
  live: boolean;
}

/**
 * Read-only placement for the account/cart plate beside the browse bottom sheet.
 * Follows the sheet's live rendered edge while it is being dragged and falls back to
 * the resting snap position otherwise, so DrawerShell remains the only owner of snap
 * geometry and drag progress — this hook only turns that into a position/opacity pair.
 */
export function useBrowseSheetNavigationPlacement(snap: SheetSnap): BrowseSheetNavigationPlacement {
  const { isStandalone } = useViewportCapabilities();
  const {
    layoutViewportHeightPx: viewportHeightPx,
    safeAreaTopPx,
    safeAreaBottomPx,
  } = useViewportMetrics();
  const dragging = useDrawerDragging();
  const liveGeometry = useDrawerGeometry();
  const live = dragging && liveGeometry !== null;
  const sheetBottomInsetPx = isStandalone ? safeAreaBottomPx : 0;

  const heights = useMemo(
    () => resolveSheetSnapHeights({
      viewportHeightPx: viewportHeightPx - safeAreaTopPx - sheetBottomInsetPx,
      peekHeightPx: resolveBrowseSheetPeekHeightPx({ safeAreaBottomPx, isStandalone }),
    }),
    [viewportHeightPx, safeAreaTopPx, sheetBottomInsetPx, safeAreaBottomPx, isStandalone],
  );
  // Mirrors DrawerShell's own sheetRestPx: the sheet's resting `top` is measured up from
  // the reachable screen's bottom edge, not the true one, now that the home-swipe strip
  // is real. `liveGeometry.top` needs no equivalent adjustment — it already comes from
  // the surface's own getBoundingClientRect(), a true on-screen measurement.
  const sheetRestPx = viewportHeightPx - sheetBottomInsetPx;

  const topPx = live ? liveGeometry.top : sheetRestPx - heights[snap];
  const { opacity, hidden } = resolveBrowseSheetNavigationOpacity({
    visibleHeightPx: sheetRestPx - topPx,
    heights,
  });

  return { topPx, opacity, hidden, live };
}
