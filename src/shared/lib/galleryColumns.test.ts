import { describe, it, expect } from 'vitest';
import { galleryColumns } from './galleryColumns';

describe('galleryColumns', () => {
  it('floors to 1 column when width is zero (before measurement)', () => {
    expect(galleryColumns(0, 'comfortable')).toBe(1);
  });

  it('floors to 1 column for a negative width', () => {
    expect(galleryColumns(-50, 'compact')).toBe(1);
  });

  it('yields round(width / target) for compact density', () => {
    expect(galleryColumns(360, 'compact')).toBe(3);
  });

  it('yields round(width / target) for comfortable density', () => {
    expect(galleryColumns(1020, 'comfortable')).toBe(3);
  });

  it('clamps to the max of 6 columns for a very large width', () => {
    expect(galleryColumns(5000, 'comfortable')).toBe(6);
  });

  it('clamps to the floor of 1 column for a sub-tile width', () => {
    expect(galleryColumns(60, 'comfortable')).toBe(1);
  });

  it('yields at least as many columns for compact as comfortable at the same width', () => {
    const width = 1000;
    expect(galleryColumns(width, 'compact')).toBeGreaterThanOrEqual(galleryColumns(width, 'comfortable'));
  });

  describe('panelCard density', () => {
    it('is 1 column at every captured compact-panel grid width', () => {
      expect(galleryColumns(296, 'panelCard')).toBe(1);
      expect(galleryColumns(336, 'panelCard')).toBe(1);
      expect(galleryColumns(456, 'panelCard')).toBe(1);
    });

    it('is 3 columns at every captured expanded-panel grid width', () => {
      expect(galleryColumns(936, 'panelCard')).toBe(3);
      expect(galleryColumns(1056, 'panelCard')).toBe(3);
      expect(galleryColumns(1416, 'panelCard')).toBe(3);
    });

    it('steps at the 1/2 and 2/3 column boundaries', () => {
      expect(galleryColumns(509, 'panelCard')).toBe(1);
      expect(galleryColumns(510, 'panelCard')).toBe(2);
      expect(galleryColumns(849, 'panelCard')).toBe(2);
      expect(galleryColumns(850, 'panelCard')).toBe(3);
    });

    it('caps at 3 columns for a very large width', () => {
      expect(galleryColumns(5000, 'panelCard')).toBe(3);
    });

    it('floors to 1 column when width is zero', () => {
      expect(galleryColumns(0, 'panelCard')).toBe(1);
    });

    it('tightens the ceiling to maxColumnsOverride at a width that would otherwise clamp to 3', () => {
      expect(galleryColumns(1416, 'panelCard', 2)).toBe(2);
    });

    it('never loosens the ceiling past the density\'s own max via maxColumnsOverride', () => {
      expect(galleryColumns(1416, 'panelCard', 5)).toBe(3);
    });

    it('still applies the 1/2 column boundary beneath an override of 2', () => {
      expect(galleryColumns(509, 'panelCard', 2)).toBe(1);
      expect(galleryColumns(510, 'panelCard', 2)).toBe(2);
    });
  });

  describe('minColumnsOverride', () => {
    it('raises the floor at a compact width that would otherwise round to 2 — the narrow-landscape-phone case', () => {
      // A 568px-wide landscape phone's side-overlay panel (45vw = 255.6px)
      // would naturally round to 2 without the floor.
      expect(galleryColumns(255.6, 'compact')).toBe(2);
      expect(galleryColumns(255.6, 'compact', undefined, 3)).toBe(3);
    });

    it('does not lower a count the natural arithmetic already put above the floor', () => {
      expect(galleryColumns(600, 'compact', undefined, 3)).toBe(5);
    });

    it('never raises the count past maxColumnsOverride when the two conflict — the ceiling always wins', () => {
      expect(galleryColumns(1000, 'compact', 2, 3)).toBe(2);
    });

    it('still floors to 1 column before measurement (width 0), regardless of the override', () => {
      expect(galleryColumns(0, 'compact', undefined, 3)).toBe(1);
    });
  });
});
