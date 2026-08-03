export const DRAWER_SHELL_TRANSITION = {
  duration: 0.28,
  ease: [0.4, 0, 0.2, 1],
} as const;

const INSTANT_TRANSITION = { duration: 0 } as const;

export interface DrawerSurfaceTransitionInput {
  isBottomSheet: boolean;
  prefersReducedMotion: boolean;
}

export function deriveDrawerSurfaceTransition({
  isBottomSheet,
  prefersReducedMotion,
}: DrawerSurfaceTransitionInput) {
  const animatedAxisTransition = prefersReducedMotion ? INSTANT_TRANSITION : DRAWER_SHELL_TRANSITION;
  return isBottomSheet
    ? { y: animatedAxisTransition, width: INSTANT_TRANSITION }
    : { y: INSTANT_TRANSITION, width: animatedAxisTransition };
}
