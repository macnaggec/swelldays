import { afterEach, describe, expect, it } from 'vitest';
import { getAnchoredVisibleRowIndex, resolveGalleryScrollOwner } from './VirtualGallery';

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
