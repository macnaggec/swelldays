/** Pure date utility functions */

export const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/**
 * capturedAt's UTC-labeled fields actually hold the camera's local wall-clock
 * time at the moment of capture (see exifExtractor.ts's toCameraLocalAsUTC) —
 * reading them through the viewer's own timezone would show a different
 * calendar day than the one the photo was taken on. Every capturedAt-derived
 * day or date string must read through this fixed 'UTC' zone, never the
 * viewer's, so the day is the same for every viewer regardless of location.
 */
export const getVisibleCalendarDayKey = (date: Date): string =>
  date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Full display date for a capturedAt-derived value — see getVisibleCalendarDayKey. */
export const formatCapturedAtDate = (
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string => new Date(date).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });

/** "Apr 1, 2026" — short human-readable date for media cards and cart labels */
export const formatShortDate = (date: Date | string): string =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** "Apr 1, 2026 · 07:00–09:30" — date + time range for session cards */
export const formatDateRange = (startsAt: Date, endsAt: Date): string => {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const startTime = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${startTime}–${endTime}`;
};
