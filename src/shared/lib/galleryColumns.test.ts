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
});
