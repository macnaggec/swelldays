import { describe, expect, it } from 'vitest';
import {
  nearestSheetSnap,
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
} from './sheetSnapPolicy';

describe('resolveSheetSnapHeights', () => {
  it('resolves the three snap heights at 390x844', () => {
    expect(resolveSheetSnapHeights({ viewportHeightPx: 844, peekHeightPx: SHEET_PEEK_HEIGHT_PX })).toEqual({
      peek: 132,
      half: 287,
      full: 776,
    });
  });

  it('resolves the three snap heights at 430x932', () => {
    expect(resolveSheetSnapHeights({ viewportHeightPx: 932, peekHeightPx: SHEET_PEEK_HEIGHT_PX })).toEqual({
      peek: 132,
      half: 317,
      full: 857,
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
  // heights: { peek: 132, half: 287, full: 776 }

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
    // 210 is 78px from peek (132) and 77px from half (287): half is nearer.
    expect(nearestSheetSnap({ heightPx: 210, velocityPx: 0, heights })).toBe('half');
  });

  it('lands on the nearer neighbour at a midpoint biased toward full', () => {
    // 532 is 245px from half (287) and 244px from full (776): full is nearer.
    expect(nearestSheetSnap({ heightPx: 532, velocityPx: 0, heights })).toBe('full');
  });

  it('resolves an exact tie between peek and half to the shorter snap', () => {
    // 209.5 is exactly 77.5px from both peek (132) and half (287).
    expect(nearestSheetSnap({ heightPx: 209.5, velocityPx: 0, heights })).toBe('peek');
  });

  it('lands on half on an upward flick from just above peek', () => {
    expect(nearestSheetSnap({ heightPx: 140, velocityPx: -500, heights })).toBe('half');
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
