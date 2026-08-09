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
 *
 * `maxColumnsOverride` tightens (never loosens) a density's own ceiling for one
 * caller's own layout constraint — e.g. a side-overlay panel that shares its
 * width with the map beside it — without giving that caller its own named
 * density or changing the tile size everyone else's grid still uses.
 *
 * `minColumnsOverride` is its mirror: raises (never lowers) the floor below
 * which `GALLERY_MIN_COLUMNS` would otherwise let the count fall — mobile
 * needs a guaranteed column count on every device, at the cost of tiles
 * narrower than the density's own target on the narrowest ones, since (unlike
 * a desktop window) it has no wider layout to grow into instead. Still yields
 * the bare `GALLERY_MIN_COLUMNS` floor before the container has been measured
 * (`measuredWidthPx <= 0`) — a transient render, not a real width to guarantee
 * a count against.
 */
export function galleryColumns(
  measuredWidthPx: number,
  density: GalleryDensity,
  maxColumnsOverride?: number,
  minColumnsOverride?: number,
): number {
  if (measuredWidthPx <= 0) return GALLERY_MIN_COLUMNS;
  const { targetTilePx, maxColumns } = GALLERY_DENSITY[density];
  const effectiveMaxColumns = maxColumnsOverride !== undefined
    ? Math.min(maxColumns, maxColumnsOverride)
    : maxColumns;
  const effectiveMinColumns = minColumnsOverride !== undefined
    ? Math.max(GALLERY_MIN_COLUMNS, minColumnsOverride)
    : GALLERY_MIN_COLUMNS;
  return Math.min(
    effectiveMaxColumns,
    Math.max(effectiveMinColumns, Math.round(measuredWidthPx / targetTilePx)),
  );
}
