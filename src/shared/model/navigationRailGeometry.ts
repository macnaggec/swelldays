import { useSyncExternalStore } from 'react';

export interface NavigationRailGeometry {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

let railGeometrySnapshot: NavigationRailGeometry | null = null;
const railGeometryListeners = new Set<() => void>();

function hasSameBounds(current: NavigationRailGeometry | null, next: NavigationRailGeometry | null) {
  if (current === next) return true;
  if (!current || !next) return false;

  return current.left === next.left
    && current.top === next.top
    && current.right === next.right
    && current.bottom === next.bottom
    && current.width === next.width
    && current.height === next.height;
}

export function publishNavigationRailGeometry(rect: DOMRectReadOnly | null): void {
  const next = rect
    ? Object.freeze({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })
    : null;

  if (hasSameBounds(railGeometrySnapshot, next)) return;

  railGeometrySnapshot = next;
  railGeometryListeners.forEach((listener) => listener());
}

export function getNavigationRailGeometrySnapshot(): NavigationRailGeometry | null {
  return railGeometrySnapshot;
}

export function subscribeNavigationRailGeometry(listener: () => void): () => void {
  railGeometryListeners.add(listener);
  return () => railGeometryListeners.delete(listener);
}

export function useNavigationRailGeometry(): NavigationRailGeometry | null {
  return useSyncExternalStore(
    subscribeNavigationRailGeometry,
    getNavigationRailGeometrySnapshot,
    () => null,
  );
}
