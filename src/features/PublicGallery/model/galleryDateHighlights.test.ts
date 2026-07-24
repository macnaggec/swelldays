import { describe, it, expect } from 'vitest';
import {
  DATE_RAIL_MIN_GALLERY_WIDTH_PX,
  activeDayIndex,
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
