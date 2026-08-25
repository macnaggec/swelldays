import { isSameCalendarDay } from 'shared/lib/dateUtils';
import type { GalleryCard } from './types';

/** All EXIF/fallback capture dates known for the current upload queue. */
export function getKnownCapturedDates(queue: GalleryCard[]): Date[] {
  const dates: Date[] = [];
  for (const card of queue) {
    if (card.kind === 'attempt') {
      if (card.capturedAt) dates.push(card.capturedAt);
    } else {
      dates.push(card.result.capturedAt);
    }
  }
  return dates;
}

/**
 * Auto-fill for the session date step: only produces a value when every known
 * capture falls on the same calendar day, so a mixed-day queue leaves the
 * picker blank rather than guessing. Deliberately date-only — camera clocks are
 * commonly left on the wrong timezone while traveling, so the shoot-time range
 * is never derived from EXIF and stays fully manual.
 */
export function deriveSessionDateFromCaptures(capturedDates: Date[]): Date | null {
  const [first, ...rest] = capturedDates;
  if (!first) return null;
  if (rest.some((d) => !isSameCalendarDay(d, first))) return null;

  // sessionDate is a plain local-midnight Date (matches DatePicker's own values),
  // so its Y/M/D is set from the capture's UTC-labelled Y/M/D, not copied verbatim.
  return new Date(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate());
}

/** sessionDate is a plain local Date; capturedAt's day lives in its UTC fields. */
export function sessionDateMatchesCapturedAt(sessionDate: Date, capturedAt: Date): boolean {
  return sessionDate.getFullYear() === capturedAt.getUTCFullYear()
    && sessionDate.getMonth() === capturedAt.getUTCMonth()
    && sessionDate.getDate() === capturedAt.getUTCDate();
}

/**
 * True when the chosen session date doesn't cover every known capture's day.
 * Requires at least two captures to compare — a single item has nothing to
 * disagree with, regardless of what the session date happens to be set to.
 */
export function hasSessionDateMismatch(sessionDate: Date | null, capturedDates: Date[]): boolean {
  if (!sessionDate) return false;
  if (capturedDates.length < 2) return false;
  return capturedDates.some((d) => !sessionDateMatchesCapturedAt(sessionDate, d));
}
