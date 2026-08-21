/**
 * capturedAt's UTC-labelled fields hold the camera's local wall-clock time.
 * Read those fixed fields in UTC so every tier assigns the same calendar day,
 * regardless of the machine or viewer timezone.
 */
export const getCapturedMediaCalendarDayKey = (date: Date): string =>
  date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
