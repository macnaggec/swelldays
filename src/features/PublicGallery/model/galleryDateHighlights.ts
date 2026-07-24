import { getVisibleCalendarDayKey } from 'shared/lib/dateUtils';

/**
 * Minimum measured gallery width at which the pinned date rail earns its strip.
 * Below this the gallery is a dense one-to-few-column grid and the rail would
 * steal usable media width (F12g invariant) — date navigation falls back to
 * sticky date headings with a date-jump menu instead.
 */
export const DATE_RAIL_MIN_GALLERY_WIDTH_PX = 600;

/** Whether the measured gallery width supports the pinned date rail. Zero width (unmeasured) never does. */
export function showsDateRail(measuredGalleryWidthPx: number): boolean {
  return measuredGalleryWidthPx >= DATE_RAIL_MIN_GALLERY_WIDTH_PX;
}

/** A jump target: the date of a gallery divider row and the row it sits at. */
export interface GalleryDateHighlight {
  date: Date;
  rowIndex: number;
}

/**
 * Collapses divider highlights to one per visible calendar day.
 *
 * Shared by the date rail and the date pill so both agree on what counts as a
 * distinct date — a divergence would let the rail and the pill jump to different
 * rows for the same day.
 */
export function toDayHighlights(highlights: GalleryDateHighlight[]): GalleryDateHighlight[] {
  const seen = new Set<string>();
  return highlights.filter(({ date }) => {
    const key = getVisibleCalendarDayKey(date);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Index of the day the gallery is currently scrolled into: the last highlight at
 * or above the first visible row. Returns 0 for an empty list or before scroll.
 */
export function activeDayIndex(dayHighlights: GalleryDateHighlight[], firstVisibleIndex: number): number {
  let active = 0;
  for (let i = 0; i < dayHighlights.length; i++) {
    if (dayHighlights[i]!.rowIndex <= firstVisibleIndex) active = i;
    else break;
  }
  return active;
}
