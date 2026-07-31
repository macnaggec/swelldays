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
  /** Null until the infinite feed has loaded the divider row for this day. */
  rowIndex: number | null;
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
 * Uses the server-owned complete date index for menu coverage, then enriches
 * whichever days are already loaded with their virtual-gallery row.
 */
export function mergeGalleryDateHighlights(
  availableDates: Date[],
  loadedHighlights: GalleryDateHighlight[],
): GalleryDateHighlight[] {
  const loadedRowByDay = new Map(
    toDayHighlights(loadedHighlights).map(({ date, rowIndex }) => [
      getVisibleCalendarDayKey(date),
      rowIndex,
    ]),
  );
  const seen = new Set<string>();

  return availableDates.flatMap((date) => {
    const key = getVisibleCalendarDayKey(date);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      date,
      rowIndex: loadedRowByDay.get(key) ?? null,
    }];
  });
}

/**
 * Index of the day the gallery is currently scrolled into: the last highlight at
 * or above the first visible row. Returns 0 for an empty list or before scroll.
 */
export function activeDayIndex(dayHighlights: GalleryDateHighlight[], firstVisibleIndex: number): number {
  let active = dayHighlights.findIndex(({ rowIndex }) => rowIndex !== null);
  if (active === -1) return 0;
  for (let i = 0; i < dayHighlights.length; i++) {
    const rowIndex = dayHighlights[i]!.rowIndex;
    if (rowIndex === null) continue;
    if (rowIndex <= firstVisibleIndex) active = i;
    else break;
  }
  return active;
}

/** Calendar-month identity used to fold the rail's days into month sections. UTC — see getVisibleCalendarDayKey. */
export function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
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
