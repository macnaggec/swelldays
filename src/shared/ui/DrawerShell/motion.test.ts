import { describe, expect, it } from 'vitest';
import { deriveDrawerSurfaceTransition, DRAWER_SHELL_TRANSITION } from './motion';

describe('deriveDrawerSurfaceTransition', () => {
  it('animates y and instantly corrects width for a bottom sheet with motion allowed', () => {
    expect(deriveDrawerSurfaceTransition({ isBottomSheet: true, prefersReducedMotion: false })).toEqual({
      y: DRAWER_SHELL_TRANSITION,
      width: { duration: 0 },
    });
  });

  it('instantly corrects both axes for a bottom sheet with reduced motion', () => {
    expect(deriveDrawerSurfaceTransition({ isBottomSheet: true, prefersReducedMotion: true })).toEqual({
      y: { duration: 0 },
      width: { duration: 0 },
    });
  });

  it('animates width and instantly corrects y for a panel with motion allowed', () => {
    expect(deriveDrawerSurfaceTransition({ isBottomSheet: false, prefersReducedMotion: false })).toEqual({
      width: DRAWER_SHELL_TRANSITION,
      y: { duration: 0 },
    });
  });

  it('instantly corrects both axes for a panel with reduced motion', () => {
    expect(deriveDrawerSurfaceTransition({ isBottomSheet: false, prefersReducedMotion: true })).toEqual({
      width: { duration: 0 },
      y: { duration: 0 },
    });
  });
});
