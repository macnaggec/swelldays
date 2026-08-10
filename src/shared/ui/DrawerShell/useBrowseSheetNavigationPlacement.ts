import { useMemo } from 'react';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { useDrawerDragging, useDrawerGeometry } from './geometry';
import {
  resolveBrowseSheetNavigationOpacity,
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
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
  const {
    layoutViewportHeightPx: viewportHeightPx,
    safeAreaTopPx,
    safeAreaBottomPx,
  } = useViewportMetrics();
  const dragging = useDrawerDragging();
  const liveGeometry = useDrawerGeometry();
  const live = dragging && liveGeometry !== null;

  const heights = useMemo(
    () => resolveSheetSnapHeights({
      viewportHeightPx: viewportHeightPx - safeAreaTopPx - safeAreaBottomPx,
      peekHeightPx: SHEET_PEEK_HEIGHT_PX,
    }),
    [viewportHeightPx, safeAreaTopPx, safeAreaBottomPx],
  );
  // Mirrors DrawerShell's own sheetRestPx: the sheet's resting `top` is measured up from
  // the reachable screen's bottom edge, not the true one, now that the home-swipe strip
  // is real. `liveGeometry.top` needs no equivalent adjustment — it already comes from
  // the surface's own getBoundingClientRect(), a true on-screen measurement.
  const sheetRestPx = viewportHeightPx - safeAreaBottomPx;

  const topPx = live ? liveGeometry.top : sheetRestPx - heights[snap];
  const { opacity, hidden } = resolveBrowseSheetNavigationOpacity({
    visibleHeightPx: sheetRestPx - topPx,
    heights,
  });

  return { topPx, opacity, hidden, live };
}
