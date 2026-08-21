import { describe, expect, it } from 'vitest';
import { deriveDrawerSurfaceTransition, DRAWER_SHELL_TRANSITION } from './motion';

describe('deriveDrawerSurfaceTransition', () => {
  it('animates y and instantly corrects x and width for a bottom sheet with motion allowed', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: true,
      isSideOverlay: false,
      prefersReducedMotion: false,
    })).toEqual({
      x: { duration: 0 },
      y: DRAWER_SHELL_TRANSITION,
      width: { duration: 0 },
    });
  });

  it('instantly corrects every axis for a bottom sheet with reduced motion', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: true,
      isSideOverlay: false,
      prefersReducedMotion: true,
    })).toEqual({
      x: { duration: 0 },
      y: { duration: 0 },
      width: { duration: 0 },
    });
  });

  it('animates width and instantly corrects x and y for a panel with motion allowed', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: false,
      isSideOverlay: false,
      prefersReducedMotion: false,
    })).toEqual({
      x: { duration: 0 },
      y: { duration: 0 },
      width: DRAWER_SHELL_TRANSITION,
    });
  });

  it('instantly corrects every axis for a panel with reduced motion', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: false,
      isSideOverlay: false,
      prefersReducedMotion: true,
    })).toEqual({
      x: { duration: 0 },
      y: { duration: 0 },
      width: { duration: 0 },
    });
  });

  it('animates x and instantly corrects y and width for a side overlay with motion allowed', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: false,
      isSideOverlay: true,
      prefersReducedMotion: false,
    })).toEqual({
      x: DRAWER_SHELL_TRANSITION,
      y: { duration: 0 },
      width: { duration: 0 },
    });
  });

  it('instantly corrects every axis for a side overlay with reduced motion', () => {
    expect(deriveDrawerSurfaceTransition({
      isBottomSheet: false,
      isSideOverlay: true,
      prefersReducedMotion: true,
    })).toEqual({
      x: { duration: 0 },
      y: { duration: 0 },
      width: { duration: 0 },
    });
  });
});
