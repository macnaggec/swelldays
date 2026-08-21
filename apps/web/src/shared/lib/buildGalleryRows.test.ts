import { afterEach, describe, it, expect, vi } from 'vitest';
import { buildGalleryRows } from './buildGalleryRows';
import type { GalleryRow } from './buildGalleryRows';

function makeItem(id: string, capturedAt: Date) {
  return { id, capturedAt };
}

const JAN_1 = new Date(Date.UTC(2024, 0, 1, 10, 0, 0));
const JAN_2 = new Date(Date.UTC(2024, 0, 2, 10, 0, 0));
const JAN_3 = new Date(Date.UTC(2024, 0, 3, 10, 0, 0));

describe('buildGalleryRows', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for empty input', () => {
    expect(buildGalleryRows([])).toEqual([]);
  });

  it('returns one divider + one full media row for 3 items on the same date', () => {
    const items = [makeItem('a', JAN_1), makeItem('b', JAN_1), makeItem('c', JAN_1)];
    const rows = buildGalleryRows(items);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.type).toBe('divider');
    expect(rows[1]!.type).toBe('media');
    expect((rows[1]! as Extract<GalleryRow, { type: 'media' }>).items).toHaveLength(3);
  });

  it('divider carries mediaRowCount equal to ceil(items / columns)', () => {
    const items = Array.from({ length: 7 }, (_, i) => makeItem(`m${i}`, JAN_1));
    const rows = buildGalleryRows(items);

    expect(rows[0]!.type).toBe('divider');
    expect((rows[0]! as Extract<GalleryRow, { type: 'divider' }>).mediaRowCount).toBe(3);
  });

  it('produces partial last row when items do not fill a full row', () => {
    const items = [makeItem('a', JAN_1), makeItem('b', JAN_1), makeItem('c', JAN_1), makeItem('d', JAN_1)];
    const rows = buildGalleryRows(items);

    expect(rows).toHaveLength(3); // divider + row(3) + row(1)
    expect((rows[2]! as Extract<GalleryRow, { type: 'media' }>).items).toHaveLength(1);
  });

  it('inserts a divider before each new date group', () => {
    const items = [makeItem('a', JAN_1), makeItem('b', JAN_1), makeItem('c', JAN_2)];
    const rows = buildGalleryRows(items);

    expect(rows).toHaveLength(4);
    expect(rows[0]!.type).toBe('divider');
    expect(rows[2]!.type).toBe('divider');
    expect((rows[0]! as Extract<GalleryRow, { type: 'divider' }>).date).toEqual(JAN_1);
    expect((rows[2]! as Extract<GalleryRow, { type: 'divider' }>).date).toEqual(JAN_2);
  });

  it('groups adjacent items by the visible calendar date', () => {
    const lateUtc = new Date('2026-06-23T22:30:00.000Z');
    const sameVisibleDay = new Date('2026-06-24T06:00:00.000Z');
    vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(function (this: Date) {
      if (this.getTime() === lateUtc.getTime()) return 'Jun 24, 2026';
      if (this.getTime() === sameVisibleDay.getTime()) return 'Jun 24, 2026';
      return '';
    });

    const rows = buildGalleryRows([
      makeItem('a', sameVisibleDay),
      makeItem('b', lateUtc),
    ]);

    expect(rows.map((r) => r.type)).toEqual(['divider', 'media']);
  });

  it('handles 3 distinct dates correctly', () => {
    const items = [makeItem('a', JAN_1), makeItem('b', JAN_2), makeItem('c', JAN_3)];
    const rows = buildGalleryRows(items);

    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.type)).toEqual(['divider', 'media', 'divider', 'media', 'divider', 'media']);
  });

  it('chunks 7 same-date items into rows of 3, 3, 1', () => {
    const items = Array.from({ length: 7 }, (_, i) => makeItem(`m${i}`, JAN_1));
    const rows = buildGalleryRows(items);

    expect(rows).toHaveLength(4);
    const mediaSizes = rows
      .filter((r) => r.type === 'media')
      .map((r) => (r.type === 'media' ? r.items.length : 0));
    expect(mediaSizes).toEqual([3, 3, 1]);
  });

  it('respects custom columns count', () => {
    const items = Array.from({ length: 4 }, (_, i) => makeItem(`m${i}`, JAN_1));
    const rows = buildGalleryRows(items, 2);

    const mediaSizes = rows
      .filter((r) => r.type === 'media')
      .map((r) => (r.type === 'media' ? r.items.length : 0));
    expect(mediaSizes).toEqual([2, 2]);
  });

  it('assigns unique keys to each row', () => {
    const items = [makeItem('a', JAN_1), makeItem('b', JAN_1), makeItem('c', JAN_2)];
    const rows = buildGalleryRows(items);
    const keys = rows.map((r) => r.key);

    expect(new Set(keys).size).toBe(rows.length);
  });
});
