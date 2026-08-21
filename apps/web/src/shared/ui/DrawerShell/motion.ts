export const DRAWER_SHELL_TRANSITION = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1],
} as const;

const INSTANT_TRANSITION = { duration: 0 } as const;

export interface DrawerSurfaceTransitionInput {
  isBottomSheet: boolean;
  /** True only for the short side-overlay presentation, whose own width never moves —
   *  opening/closing instead translates it on/off screen (M06h). */
  isSideOverlay: boolean;
  prefersReducedMotion: boolean;
}

export function deriveDrawerSurfaceTransition({
  isBottomSheet,
  isSideOverlay,
  prefersReducedMotion,
}: DrawerSurfaceTransitionInput) {
  const animatedAxisTransition = prefersReducedMotion ? INSTANT_TRANSITION : DRAWER_SHELL_TRANSITION;
  if (isBottomSheet) {
    return { x: INSTANT_TRANSITION, y: animatedAxisTransition, width: INSTANT_TRANSITION };
  }
  if (isSideOverlay) {
    return { x: animatedAxisTransition, y: INSTANT_TRANSITION, width: INSTANT_TRANSITION };
  }
  return { x: INSTANT_TRANSITION, y: INSTANT_TRANSITION, width: animatedAxisTransition };
}
