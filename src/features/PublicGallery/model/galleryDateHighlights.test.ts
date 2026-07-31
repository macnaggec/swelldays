import { describe, it, expect } from 'vitest';
import {
  DATE_RAIL_MIN_GALLERY_WIDTH_PX,
  activeDayIndex,
  groupDaysByMonth,
  mergeGalleryDateHighlights,
  showsDateRail,
  toDayHighlights,
} from './galleryDateHighlights';

describe('toDayHighlights', () => {
  it('keeps one highlight per visible calendar day, preserving the first row of each', () => {
    const morning = { date: new Date('2026-06-24T06:00:00.000Z'), rowIndex: 0 };
    const afternoon = { date: new Date('2026-06-24T15:00:00.000Z'), rowIndex: 4 };
    const nextDay = { date: new Date('2026-06-25T06:00:00.000Z'), rowIndex: 8 };

    const days = toDayHighlights([morning, afternoon, nextDay]);

    expect(days).toEqual([morning, nextDay]);
  });
});

describe('mergeGalleryDateHighlights', () => {
  it('lists every available day immediately and attaches row indexes only to loaded days', () => {
    const july = new Date('2026-07-21T12:00:00.000Z');
    const june = new Date('2026-06-25T12:00:00.000Z');

    expect(mergeGalleryDateHighlights(
      [july, june],
      [{ date: july, rowIndex: 4 }],
    )).toEqual([
      { date: july, rowIndex: 4 },
      { date: june, rowIndex: null },
    ]);
  });
});

describe('activeDayIndex', () => {
  const days = [
    { date: new Date('2026-06-24T06:00:00.000Z'), rowIndex: 0 },
    { date: new Date('2026-06-25T06:00:00.000Z'), rowIndex: 5 },
    { date: new Date('2026-06-26T06:00:00.000Z'), rowIndex: 12 },
  ];

  it('returns the last day at or above the first visible row', () => {
    expect(activeDayIndex(days, 7)).toBe(1);
  });

  it('stays on the first day before its second day scrolls into view', () => {
    expect(activeDayIndex(days, 4)).toBe(0);
  });

  it('returns 0 for an empty highlight list', () => {
    expect(activeDayIndex([], 3)).toBe(0);
  });
});

describe('groupDaysByMonth', () => {
  it('folds days into month sections in scroll order, newest month first', () => {
    const days = [
      { date: new Date('2026-07-21T12:00:00.000Z'), rowIndex: 0 },
      { date: new Date('2026-07-18T12:00:00.000Z'), rowIndex: 4 },
      { date: new Date('2026-06-25T12:00:00.000Z'), rowIndex: 8 },
      { date: new Date('2026-06-20T12:00:00.000Z'), rowIndex: 12 },
    ];

    const groups = groupDaysByMonth(days);

    expect(groups.map((g) => g.key)).toEqual(['2026-6', '2026-5']);
    expect(groups.map((g) => g.days.length)).toEqual([2, 2]);
    // First shot of each month is the newest day, at the smallest row index.
    expect(groups.map((g) => g.days[0]!.rowIndex)).toEqual([0, 8]);
  });

  it('returns an empty list of sections for no days', () => {
    expect(groupDaysByMonth([])).toEqual([]);
  });
});

describe('showsDateRail', () => {
  it('shows the rail at the capability threshold', () => {
    expect(showsDateRail(DATE_RAIL_MIN_GALLERY_WIDTH_PX)).toBe(true);
  });

  it('hides the rail just below the capability threshold', () => {
    expect(showsDateRail(DATE_RAIL_MIN_GALLERY_WIDTH_PX - 1)).toBe(false);
  });

  it('hides the rail before the gallery is measured (zero width)', () => {
    expect(showsDateRail(0)).toBe(false);
  });
});
