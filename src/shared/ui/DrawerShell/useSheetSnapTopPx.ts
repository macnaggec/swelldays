import { useMemo } from 'react';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import {
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
  type SheetSnap,
} from './sheetSnapPolicy';

/**
 * Read-only target projection for chrome that travels beside the bottom sheet.
 * DrawerShell remains the only owner of snap geometry; consumers receive only
 * the current snap's top edge in viewport pixels.
 */
export function useSheetSnapTopPx(snap: SheetSnap): number {
  const { layoutViewportHeightPx: viewportHeightPx } = useViewportMetrics();

  return useMemo(() => {
    const heights = resolveSheetSnapHeights({
      viewportHeightPx,
      peekHeightPx: SHEET_PEEK_HEIGHT_PX,
    });
    return viewportHeightPx - heights[snap];
  }, [snap, viewportHeightPx]);
}
