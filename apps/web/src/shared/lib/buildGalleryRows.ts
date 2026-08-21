import { getCapturedMediaCalendarDayKey } from '@wave-atlas/contracts';

export type GalleryRow<T = { id: string; capturedAt: Date }> =
  | { type: 'divider'; date: Date; key: string; mediaRowCount: number }
  | { type: 'media'; items: T[]; key: string };

/**
 * Builds a flat list of rows for the virtual gallery.
 *
 * @param items   Items sorted capturedAt DESC (as returned by the API).
 * @param columns Number of cards per media row (default 3).
 */
export function buildGalleryRows<T extends { id: string; capturedAt: Date }>(
  items: T[],
  columns = 3,
): GalleryRow<T>[] {
  if (items.length === 0) return [];

  const rows: GalleryRow<T>[] = [];
  let groupStart = 0;

  while (groupStart < items.length) {
    const groupDate = items[groupStart]!.capturedAt;
    const groupDateKey = getCapturedMediaCalendarDayKey(groupDate);

    let groupEnd = groupStart + 1;
    while (
      groupEnd < items.length
      && getCapturedMediaCalendarDayKey(items[groupEnd]!.capturedAt) === groupDateKey
    ) {
      groupEnd++;
    }

    const groupItems = items.slice(groupStart, groupEnd);
    const mediaRowCount = Math.ceil(groupItems.length / columns);

    rows.push({
      type: 'divider',
      date: groupDate,
      key: `divider-${groupDate.toISOString()}`,
      mediaRowCount
    });

    for (let i = 0; i < groupItems.length; i += columns) {
      const chunk = groupItems.slice(i, i + columns);
      rows.push({
        type: 'media',
        items: chunk,
        key: `media-${chunk[0]!.id}`
      });
    }

    groupStart = groupEnd;
  }

  return rows;
}
