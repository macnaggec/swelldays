import { describe, expect, it } from 'vitest';
import { PANEL_COMPACT_MIN_WIDTH_PX, resolvePanelWidthPx } from './panelExpansionStore';

describe('resolvePanelWidthPx', () => {
  it('never floors expanded, even at a narrow viewport', () => {
    expect(resolvePanelWidthPx('expanded', 800)).toBe(600);
  });

  it('follows the pure 25vw fraction once it already clears the floor', () => {
    expect(resolvePanelWidthPx('compact', 1920)).toBe(480);
  });

  it('lands exactly on the floor at the viewport where the two agree', () => {
    expect(resolvePanelWidthPx('compact', 1440)).toBe(PANEL_COMPACT_MIN_WIDTH_PX);
  });

  it('holds the floor instead of shrinking further on a narrower desktop window', () => {
    expect(resolvePanelWidthPx('compact', 1024)).toBe(PANEL_COMPACT_MIN_WIDTH_PX);
  });
});
