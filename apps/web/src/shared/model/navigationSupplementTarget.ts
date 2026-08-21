import { useSyncExternalStore } from 'react';

/**
 * The DOM node AppNavigation renders as a mount point inside its own
 * account/cart stack, published as a plain external store rather than React
 * Context: AppNavigation and routed content are mounted as siblings at the
 * composition root (`__root.tsx`'s `<AppShell />` and `<Outlet />`), so no
 * Context Provider placed inside AppNavigation's own subtree could ever reach
 * a route-rendered consumer. Mirrors navigationRailGeometry.ts's publish/
 * subscribe shape for the same reason that module isn't Context either.
 */
let supplementTargetSnapshot: HTMLElement | null = null;
const supplementTargetListeners = new Set<() => void>();

export function publishNavigationSupplementTarget(target: HTMLElement | null): void {
  if (supplementTargetSnapshot === target) return;

  supplementTargetSnapshot = target;
  supplementTargetListeners.forEach((listener) => listener());
}

export function getNavigationSupplementTargetSnapshot(): HTMLElement | null {
  return supplementTargetSnapshot;
}

export function subscribeNavigationSupplementTarget(listener: () => void): () => void {
  supplementTargetListeners.add(listener);
  return () => supplementTargetListeners.delete(listener);
}

export function useNavigationSupplementTarget(): HTMLElement | null {
  return useSyncExternalStore(
    subscribeNavigationSupplementTarget,
    getNavigationSupplementTargetSnapshot,
    () => null,
  );
}
