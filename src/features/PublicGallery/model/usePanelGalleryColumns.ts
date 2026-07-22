import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';

/**
 * Derives the gallery column count from the panel's known width.
 *
 * The gallery lives in the side panel, whose width is a fixed fraction of the
 * viewport (25vw compact, 75vw expanded — {@link PANEL_WIDTH_VW}). CSS viewport
 * media queries can't see that, so column count is computed here and fed to both
 * the row-chunking (buildGalleryRows) and the grid template — one source of truth.
 *
 * Compact stays dense (small tiles, actions moved to the lightbox); expanded uses
 * larger tiles. Both scale up on wide monitors.
 */
const COMPACT_TARGET_TILE = 120;
const EXPANDED_TARGET_TILE = 340;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 6;
const PANEL_PADDING = 24;
const SIDEBAR_ALLOWANCE = 40;

export function usePanelGalleryColumns(expanded: boolean): number {
  const { viewportWidthPx } = useViewportCapabilities();

  const panelFraction = (expanded ? PANEL_WIDTH_VW.expanded : PANEL_WIDTH_VW.compact) / 100;
  const gridWidth = viewportWidthPx * panelFraction - PANEL_PADDING - (expanded ? SIDEBAR_ALLOWANCE : 0);
  const targetTile = expanded ? EXPANDED_TARGET_TILE : COMPACT_TARGET_TILE;

  const columns = Math.round(gridWidth / targetTile);
  return Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, columns));
}
