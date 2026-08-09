import { describe, expect, it } from 'vitest';
import {
  nearestSheetSnap,
  resolveBrowseSheetNavigationOpacity,
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
      peek: 89,
      half: 287,
      full: 820,
    });
    expect({
      peek: viewportHeightPx - heights.peek,
      half: viewportHeightPx - heights.half,
      full: viewportHeightPx - heights.full,
    }).toEqual({
      peek: 755,
      half: 557,
      full: 24,
    });
  });

  it('resolves the three snap heights at 430x932', () => {
    expect(resolveSheetSnapHeights({ viewportHeightPx: 932, peekHeightPx: SHEET_PEEK_HEIGHT_PX })).toEqual({
      peek: 89,
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
  // heights: { peek: 89, half: 287, full: 820 }

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
    // 230 is 141px from peek (89) and 57px from half (287): half is nearer.
    expect(nearestSheetSnap({ heightPx: 230, velocityPx: 0, heights })).toBe('half');
  });

  it('lands on the nearer neighbour at a midpoint biased toward full', () => {
    // 554 is 267px from half (287) and 266px from full (820): full is nearer.
    expect(nearestSheetSnap({ heightPx: 554, velocityPx: 0, heights })).toBe('full');
  });

  it('resolves an exact tie between peek and half to the shorter snap', () => {
    // 188 is exactly 99px from both peek (89) and half (287).
    expect(nearestSheetSnap({ heightPx: 188, velocityPx: 0, heights })).toBe('peek');
  });

  it('lands on half on an upward flick from just above peek', () => {
    expect(nearestSheetSnap({ heightPx: 120, velocityPx: -500, heights })).toBe('half');
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

describe('resolveBrowseSheetNavigationOpacity', () => {
  const heights = resolveSheetSnapHeights({ viewportHeightPx: 844, peekHeightPx: SHEET_PEEK_HEIGHT_PX });
  // heights: { peek: 89, half: 287, full: 820 }

  it('is fully opaque and not hidden at or below the half height', () => {
    expect(resolveBrowseSheetNavigationOpacity({ visibleHeightPx: heights.half, heights })).toEqual({
      opacity: 1,
      hidden: false,
    });
    expect(resolveBrowseSheetNavigationOpacity({ visibleHeightPx: heights.peek, heights })).toEqual({
      opacity: 1,
      hidden: false,
    });
  });

  it('is fully transparent and hidden at or above the full height', () => {
    expect(resolveBrowseSheetNavigationOpacity({ visibleHeightPx: heights.full, heights })).toEqual({
      opacity: 0,
      hidden: true,
    });
  });

  it('is exactly half-faded at the midpoint between half and full', () => {
    const midpoint = (heights.half + heights.full) / 2;
    expect(resolveBrowseSheetNavigationOpacity({ visibleHeightPx: midpoint, heights })).toEqual({
      opacity: 0.5,
      hidden: false,
    });
  });

  it('fades monotonically as the sheet rises from half toward full', () => {
    const span = heights.full - heights.half;
    const first = resolveBrowseSheetNavigationOpacity({
      visibleHeightPx: heights.half + span * 0.25,
      heights,
    }).opacity;
    const second = resolveBrowseSheetNavigationOpacity({
      visibleHeightPx: heights.half + span * 0.5,
      heights,
    }).opacity;
    const third = resolveBrowseSheetNavigationOpacity({
      visibleHeightPx: heights.half + span * 0.75,
      heights,
    }).opacity;

    expect(first).toBeGreaterThan(second);
    expect(second).toBeGreaterThan(third);
  });
});
