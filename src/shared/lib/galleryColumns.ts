/**
 * Tile-size role for a measured grid. `compact` and `comfortable` mirror the drawer
 * policy's contentDensity; `panelCard` is the panel collection-card role, which caps
 * lower because session cards stay at three columns however wide the panel gets.
 */
export type GalleryDensity = 'compact' | 'comfortable' | 'panelCard';

interface DensitySpec {
  /** Target tile edge in px. */
  readonly targetTilePx: number;
  /** Upper column bound for this role. */
  readonly maxColumns: number;
}

export const GALLERY_DENSITY: Record<GalleryDensity, DensitySpec> = {
  compact: { targetTilePx: 120, maxColumns: 6 },
  comfortable: { targetTilePx: 340, maxColumns: 6 },
  panelCard: { targetTilePx: 340, maxColumns: 3 },
};

export const GALLERY_MIN_COLUMNS = 1;

/**
 * Pure column count from a measured gallery width.
 *
 * Band-agnostic by construction: the count falls out of measured width ÷ target
 * tile, so the same policy yields one column on a phone through six on a wide
 * monitor with no per-band table — Phase M consumes it unchanged. A non-positive
 * width (before the container is measured) yields the single-column floor.
 */
export function galleryColumns(measuredWidthPx: number, density: GalleryDensity): number {
  if (measuredWidthPx <= 0) return GALLERY_MIN_COLUMNS;
  const { targetTilePx, maxColumns } = GALLERY_DENSITY[density];
  return Math.min(
    maxColumns,
    Math.max(GALLERY_MIN_COLUMNS, Math.round(measuredWidthPx / targetTilePx)),
  );
}
