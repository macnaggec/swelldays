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

/** Calendar-month identity used to fold the rail's days into month sections. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

/** One month section of the date rail: its days (newest first) and where its first shot sits. */
export interface GalleryMonthGroup {
  key: string;
  /** The month's newest day — labels the section header. */
  monthDate: Date;
  days: GalleryDateHighlight[];
}

/**
 * Folds day highlights into month sections in scroll order (newest month first).
 * The rail keeps exactly the in-view month's section unfolded; every other
 * month shows only its header until scrolled or tapped into view.
 */
export function groupDaysByMonth(dayHighlights: GalleryDateHighlight[]): GalleryMonthGroup[] {
  const groups: GalleryMonthGroup[] = [];
  const byKey = new Map<string, GalleryMonthGroup>();
  for (const day of dayHighlights) {
    const key = monthKeyOf(day.date);
    let group = byKey.get(key);
    if (!group) {
      group = { key, monthDate: day.date, days: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.days.push(day);
  }
  return groups;
}
