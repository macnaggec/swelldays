import { describe, expect, it } from 'vitest';
import { deriveKeyboardInsetPx } from './keyboardInset';

describe('deriveKeyboardInsetPx', () => {
  it('returns 0 when the visual viewport matches the layout viewport (no keyboard)', () => {
    expect(deriveKeyboardInsetPx({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 844,
      visualViewportOffsetTopPx: 0,
    })).toBe(0);
  });

  it('returns the covered strip height when the visual viewport shrinks', () => {
    expect(deriveKeyboardInsetPx({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 550,
      visualViewportOffsetTopPx: 0,
    })).toBe(294);
  });

  it('subtracts a non-zero visual-viewport offset too', () => {
    expect(deriveKeyboardInsetPx({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 550,
      visualViewportOffsetTopPx: 20,
    })).toBe(274);
  });

  it('clamps to 0 rather than going negative when the visual viewport plus its offset exceeds the layout viewport', () => {
    expect(deriveKeyboardInsetPx({
      layoutViewportHeightPx: 844,
      visualViewportHeightPx: 844,
      visualViewportOffsetTopPx: 10,
    })).toBe(0);
  });
});
