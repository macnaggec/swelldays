/** Pure date utility functions */

export const isSameCalendarDay = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() === b.getUTCFullYear() &&
  a.getUTCMonth() === b.getUTCMonth() &&
  a.getUTCDate() === b.getUTCDate();

/** Full display date for a capturedAt-derived value — see getCapturedMediaCalendarDayKey. */
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
