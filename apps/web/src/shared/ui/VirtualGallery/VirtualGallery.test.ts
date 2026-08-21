import { afterEach, describe, expect, it } from 'vitest';
import { getAnchoredVisibleRowIndex, recordRowMeasurement, resolveGalleryScrollOwner } from './VirtualGallery';

describe('getAnchoredVisibleRowIndex', () => {
  it('uses the row around the viewport anchor instead of the first partially visible row', () => {
    const rows = [
      { index: 10, start: 1515, size: 220 },
      { index: 11, start: 1735, size: 48 },
      { index: 12, start: 1783, size: 220 },
    ];

    expect(getAnchoredVisibleRowIndex(rows, 1634, 611)).toBe(11);
  });
});

describe('recordRowMeasurement', () => {
  it('reports no change for a row measured for the first time', () => {
    const heights = new Map<number, number>();

    expect(recordRowMeasurement(heights, 0, 220)).toBe(false);
    expect(heights.get(0)).toBe(220);
  });

  it('reports no change when a row remeasures at the same height', () => {
    const heights = new Map<number, number>([[0, 220]]);

    expect(recordRowMeasurement(heights, 0, 220)).toBe(false);
  });

  it('reports a change when a row remeasures at a different height', () => {
    const heights = new Map<number, number>([[0, 220]]);

    expect(recordRowMeasurement(heights, 0, 340)).toBe(true);
    expect(heights.get(0)).toBe(340);
  });

  it('tracks each row index independently', () => {
    const heights = new Map<number, number>([[0, 220]]);

    expect(recordRowMeasurement(heights, 1, 32)).toBe(false);
    expect(heights.get(0)).toBe(220);
    expect(heights.get(1)).toBe(32);
  });
});

describe('resolveGalleryScrollOwner', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves to the nearest ancestor panel scroll owner when one exists', () => {
    document.body.innerHTML = '<div data-panel-scroll-owner><div><div id="inner"></div></div></div>';
    const inner = document.getElementById('inner')!;
    const owner = document.querySelector('[data-panel-scroll-owner]')!;

    expect(resolveGalleryScrollOwner(inner)).toBe(owner);
  });

  it('falls back to the container itself when no scroll-owner ancestor exists', () => {
    // Standalone usage — e.g. mounted outside PanelLayout, as VirtualGallery's
    // own tests do — must keep scrolling itself rather than resolving to null.
    document.body.innerHTML = '<div id="standalone"></div>';
    const standalone = document.getElementById('standalone')!;

    expect(resolveGalleryScrollOwner(standalone)).toBe(standalone);
  });
});
