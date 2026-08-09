import { describe, it, expect } from 'vitest';
import {
  DATE_RAIL_HIDE_WIDTH_PX,
  DATE_RAIL_SHOW_WIDTH_PX,
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
  it('hides the rail before the gallery is measured (zero width), starting hidden', () => {
    expect(showsDateRail(0, false)).toBe(false);
  });

  describe('while hidden', () => {
    it('stays hidden right at the hide threshold — that is not the width that shows it', () => {
      expect(showsDateRail(DATE_RAIL_HIDE_WIDTH_PX, false)).toBe(false);
    });

    it('stays hidden just below the show threshold', () => {
      expect(showsDateRail(DATE_RAIL_SHOW_WIDTH_PX - 1, false)).toBe(false);
    });

    it('shows once the width reaches the (higher) show threshold', () => {
      expect(showsDateRail(DATE_RAIL_SHOW_WIDTH_PX, false)).toBe(true);
    });
  });

  describe('while showing', () => {
    it('keeps showing at the show threshold', () => {
      expect(showsDateRail(DATE_RAIL_SHOW_WIDTH_PX, true)).toBe(true);
    });

    it('keeps showing in the gap between the two thresholds — this is the fix: a single-threshold rule would have hidden here', () => {
      expect(showsDateRail(DATE_RAIL_HIDE_WIDTH_PX + 10, true)).toBe(true);
    });

    it('keeps showing right at the hide threshold', () => {
      expect(showsDateRail(DATE_RAIL_HIDE_WIDTH_PX, true)).toBe(true);
    });

    it('hides once the width drops below the hide threshold', () => {
      expect(showsDateRail(DATE_RAIL_HIDE_WIDTH_PX - 1, true)).toBe(false);
    });
  });

  it('the gap between the two thresholds exceeds the rail\'s own ~37px measured footprint, which is what makes the hysteresis actually break the oscillation loop', () => {
    expect(DATE_RAIL_SHOW_WIDTH_PX - DATE_RAIL_HIDE_WIDTH_PX).toBeGreaterThan(37);
  });
});
