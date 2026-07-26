import { useSyncExternalStore } from 'react';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';

export interface DrawerGeometry {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

let geometrySnapshot: DrawerGeometry | null = null;
const geometryListeners = new Set<() => void>();

function hasSameBounds(current: DrawerGeometry | null, next: DrawerGeometry | null) {
  if (current === next) return true;
  if (!current || !next) return false;

  return current.left === next.left
    && current.top === next.top
    && current.right === next.right
    && current.bottom === next.bottom
    && current.width === next.width
    && current.height === next.height;
}

export function publishDrawerGeometry(rect: DOMRectReadOnly | null) {
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

  if (hasSameBounds(geometrySnapshot, next)) return;

  geometrySnapshot = next;
  geometryListeners.forEach((listener) => listener());
}

export function getDrawerGeometrySnapshot() {
  return geometrySnapshot;
}

export function subscribeDrawerGeometry(listener: () => void) {
  geometryListeners.add(listener);
  return () => geometryListeners.delete(listener);
}

export function useDrawerGeometry() {
  return useSyncExternalStore(
    subscribeDrawerGeometry,
    getDrawerGeometrySnapshot,
    () => null,
  );
}

let drawerMoving = false;
const motionListeners = new Set<() => void>();

/**
 * Whether the drawer surface is currently animating between its two states.
 *
 * Published separately from geometry because controls placed *beside* the drawer are
 * not part of it and cannot follow it convincingly: they have no width of their own to
 * animate, so tracking the moving edge would drag them across the screen, and jumping
 * to the final inset puts them in the panel's future position while it is still in its
 * old one. They wait instead, and appear once the panel has arrived.
 */
export function publishDrawerMotion(moving: boolean) {
  if (drawerMoving === moving) return;
  drawerMoving = moving;
  motionListeners.forEach((listener) => listener());
}

export function useDrawerMoving() {
  return useSyncExternalStore(
    (listener) => {
      motionListeners.add(listener);
      return () => motionListeners.delete(listener);
    },
    () => drawerMoving,
    () => false,
  );
}

export function useDrawerAdjacentInlineEndInset(gapPx = 0) {
  const geometry = useDrawerGeometry();
  const { viewportWidthPx } = useViewportCapabilities();

  if (!geometry) return null;

  return Math.max(0, viewportWidthPx - geometry.left) + gapPx;
}
