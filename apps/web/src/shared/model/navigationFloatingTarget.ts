import { useSyncExternalStore } from 'react';

/**
 * A mount point that sits beside AppNavigation's own `.root`, not inside it —
 * for content that positions itself with `position: fixed` against the real
 * viewport (e.g. a switcher pill centered over the drawer). `.root` carries
 * an unconditional `transform` (even at its default `translateY(0)`, for the
 * browse-sheet-tracking case), and any element with a `transform` becomes the
 * containing block for every `position: fixed` descendant — so content
 * mounted inside `.root` would compute its "fixed" position against that
 * small icon-stack box instead of the viewport. Published as a plain
 * external store rather than React Context for the same reason
 * navigationSupplementTarget.ts is: AppNavigation and routed content mount as
 * siblings at the composition root, so no Context Provider placed inside
 * AppNavigation's own subtree could ever reach a route-rendered consumer.
 */
let floatingTargetSnapshot: HTMLElement | null = null;
const floatingTargetListeners = new Set<() => void>();

export function publishNavigationFloatingTarget(target: HTMLElement | null): void {
  if (floatingTargetSnapshot === target) return;

  floatingTargetSnapshot = target;
  floatingTargetListeners.forEach((listener) => listener());
}

export function getNavigationFloatingTargetSnapshot(): HTMLElement | null {
  return floatingTargetSnapshot;
}

export function subscribeNavigationFloatingTarget(listener: () => void): () => void {
  floatingTargetListeners.add(listener);
  return () => floatingTargetListeners.delete(listener);
}

export function useNavigationFloatingTarget(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeNavigationFloatingTarget,
    getNavigationFloatingTargetSnapshot,
    () => null,
  );
}
