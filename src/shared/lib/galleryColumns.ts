/** Card density for the public gallery, matching the drawer policy's contentDensity vocabulary. */
export type GalleryDensity = 'compact' | 'comfortable';

/** Target tile edge in px per density. Compact packs a dense grid; comfortable keeps roomy cards. */
export const GALLERY_TARGET_TILE_PX: Record<GalleryDensity, number> = {
  compact: 120,
  comfortable: 340,
};

export const GALLERY_MIN_COLUMNS = 1;
export const GALLERY_MAX_COLUMNS = 6;

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
  return Math.min(
    GALLERY_MAX_COLUMNS,
    Math.max(GALLERY_MIN_COLUMNS, Math.round(measuredWidthPx / GALLERY_TARGET_TILE_PX[density])),
  );
}
