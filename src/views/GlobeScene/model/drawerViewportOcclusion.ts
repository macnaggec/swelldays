import type { DrawerGeometry } from 'shared/ui/DrawerShell';

export interface DrawerViewportOcclusionInput {
  drawerBounds: Pick<DrawerGeometry, 'left' | 'right'> | null;
  viewportWidthPx: number;
}

/** Drawer overlap with the map's full-viewport canvas, rounded for Mapbox camera padding. */
export function deriveDrawerViewportOcclusionPx({
  drawerBounds,
  viewportWidthPx,
}: DrawerViewportOcclusionInput): number {
  if (!drawerBounds) return 0;

  const overlapLeft = Math.max(0, drawerBounds.left);
  const overlapRight = Math.min(viewportWidthPx, drawerBounds.right);
  return Math.max(0, Math.round(overlapRight - overlapLeft));
}
