import { describe, it, expect } from 'vitest';
import { formatDimensions } from './formatDimensions';

describe('formatDimensions', () => {
  it('formats present dimensions as "W × H"', () => {
    expect(formatDimensions(4032, 3024)).toBe('4032 × 3024');
  });

  it('returns null when either dimension is missing', () => {
    expect(formatDimensions(null, 1080)).toBeNull();
    expect(formatDimensions(1920, null)).toBeNull();
    expect(formatDimensions(undefined, undefined)).toBeNull();
    expect(formatDimensions(0, 1080)).toBeNull();
  });
});
