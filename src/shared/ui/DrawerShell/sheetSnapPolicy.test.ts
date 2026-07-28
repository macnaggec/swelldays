import { describe, expect, it } from 'vitest';
import {
  nearestSheetSnap,
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
} from './sheetSnapPolicy';

describe('resolveSheetSnapHeights', () => {
  it('resolves the three snap heights at 390x844', () => {
    const viewportHeightPx = 844;
    const heights = resolveSheetSnapHeights({
      viewportHeightPx,
      peekHeightPx: SHEET_PEEK_HEIGHT_PX,
    });

    expect(heights).toEqual({
      peek: 84,
      half: 287,
      full: 820,
    });
    expect({
      peek: viewportHeightPx - heights.peek,
      half: viewportHeightPx - heights.half,
      full: viewportHeightPx - heights.full,
    }).toEqual({
      peek: 760,
      half: 557,
      full: 24,
    });
  });

  it('resolves the three snap heights at 430x932', () => {
    expect(resolveSheetSnapHeights({ viewportHeightPx: 932, peekHeightPx: SHEET_PEEK_HEIGHT_PX })).toEqual({
      peek: 84,
      half: 317,
      full: 908,
    });
  });

  it('clamps monotonically when the viewport is shorter than the peek height', () => {
    const heights = resolveSheetSnapHeights({ viewportHeightPx: 100, peekHeightPx: 132 });

    expect(heights).toEqual({ peek: 100, half: 100, full: 100 });
    expect(heights.peek).toBeLessThanOrEqual(heights.half);
    expect(heights.half).toBeLessThanOrEqual(heights.full);
    expect(heights.full).toBeLessThanOrEqual(100);
  });
});

describe('nearestSheetSnap', () => {
  const heights = resolveSheetSnapHeights({ viewportHeightPx: 844, peekHeightPx: SHEET_PEEK_HEIGHT_PX });
  // heights: { peek: 84, half: 287, full: 820 }

  it('lands on peek when at rest exactly at the peek height', () => {
    expect(nearestSheetSnap({ heightPx: heights.peek, velocityPx: 0, heights })).toBe('peek');
  });

  it('lands on half when at rest exactly at the half height', () => {
    expect(nearestSheetSnap({ heightPx: heights.half, velocityPx: 0, heights })).toBe('half');
  });

  it('lands on full when at rest exactly at the full height', () => {
    expect(nearestSheetSnap({ heightPx: heights.full, velocityPx: 0, heights })).toBe('full');
  });

  it('lands on the nearer neighbour at a midpoint biased toward half', () => {
    // 186 is 102px from peek (84) and 101px from half (287): half is nearer.
    expect(nearestSheetSnap({ heightPx: 186, velocityPx: 0, heights })).toBe('half');
  });

  it('lands on the nearer neighbour at a midpoint biased toward full', () => {
    // 554 is 267px from half (287) and 266px from full (820): full is nearer.
    expect(nearestSheetSnap({ heightPx: 554, velocityPx: 0, heights })).toBe('full');
  });

  it('resolves an exact tie between peek and half to the shorter snap', () => {
    // 185.5 is exactly 101.5px from both peek (84) and half (287).
    expect(nearestSheetSnap({ heightPx: 185.5, velocityPx: 0, heights })).toBe('peek');
  });

  it('lands on half on an upward flick from just above peek', () => {
    expect(nearestSheetSnap({ heightPx: 90, velocityPx: -500, heights })).toBe('half');
  });

  it('lands on half on a downward flick from just below full', () => {
    expect(nearestSheetSnap({ heightPx: 750, velocityPx: 500, heights })).toBe('half');
  });

  it('stays at full on an upward flick already at full', () => {
    expect(nearestSheetSnap({ heightPx: heights.full, velocityPx: -500, heights })).toBe('full');
  });

  it('stays at peek on a downward flick already at peek', () => {
    expect(nearestSheetSnap({ heightPx: heights.peek, velocityPx: 500, heights })).toBe('peek');
  });
});
