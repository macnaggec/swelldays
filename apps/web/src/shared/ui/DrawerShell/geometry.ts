import { useSyncExternalStore } from 'react';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import type { DrawerShellState } from './DrawerShell';
import type { SheetSnap } from './sheetSnapPolicy';

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

let targetGeometrySnapshot: DrawerGeometry | null = null;
const targetGeometryListeners = new Set<() => void>();

/**
 * The drawer bounds it is moving toward. Kept separate from measured geometry
 * so map camera intent can target the final unobscured viewport immediately,
 * while adjacent chrome can continue using the surface's settled DOM bounds.
 */
export function publishDrawerTargetGeometry(rect: DrawerGeometry | null) {
  const next = rect ? Object.freeze({ ...rect }) : null;
  if (hasSameBounds(targetGeometrySnapshot, next)) return;

  targetGeometrySnapshot = next;
  targetGeometryListeners.forEach((listener) => listener());
}

export function useDrawerTargetGeometry() {
  return useSyncExternalStore(
    (listener) => {
      targetGeometryListeners.add(listener);
      return () => targetGeometryListeners.delete(listener);
    },
    () => targetGeometrySnapshot,
    () => null,
  );
}

let panelStateSnapshot: DrawerShellState | null = null;
const panelStateListeners = new Set<() => void>();

/**
 * Which of its two widths the side panel is presenting, or null when the mounted drawer
 * isn't a panel. Published in the same commit as the target geometry above, and for the
 * same reason the snap below is: a consumer that instead reads the *preference* driving
 * the change sees it a render earlier than the bounds it implies, and would pair
 * "collapsed" with the still-expanded bounds. The map camera did exactly that and
 * recentred onto the expanded width for one frame before settling back.
 */
export function publishDrawerPanelState(state: DrawerShellState | null) {
  if (panelStateSnapshot === state) return;
  panelStateSnapshot = state;
  panelStateListeners.forEach((listener) => listener());
}

export function useDrawerPanelState() {
  return useSyncExternalStore(
    (listener) => {
      panelStateListeners.add(listener);
      return () => panelStateListeners.delete(listener);
    },
    () => panelStateSnapshot,
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

let drawerDragging = false;
const draggingListeners = new Set<() => void>();

/** Whether the bottom sheet is currently under an active pointer drag. */
export function publishDrawerDragging(dragging: boolean) {
  if (drawerDragging === dragging) return;
  drawerDragging = dragging;
  draggingListeners.forEach((listener) => listener());
}

export function useDrawerDragging() {
  return useSyncExternalStore(
    (listener) => {
      draggingListeners.add(listener);
      return () => draggingListeners.delete(listener);
    },
    () => drawerDragging,
    () => false,
  );
}

let sheetSnapSnapshot: SheetSnap | null = null;
const sheetSnapListeners = new Set<() => void>();

/** The bottom sheet's current (resting or in-flight target) snap, or null when the mounted drawer isn't a bottom sheet. */
export function publishDrawerSheetSnap(snap: SheetSnap | null) {
  if (sheetSnapSnapshot === snap) return;
  sheetSnapSnapshot = snap;
  sheetSnapListeners.forEach((listener) => listener());
}

export function useDrawerSheetSnap() {
  return useSyncExternalStore(
    (listener) => {
      sheetSnapListeners.add(listener);
      return () => sheetSnapListeners.delete(listener);
    },
    () => sheetSnapSnapshot,
    () => null,
  );
}

export function useDrawerAdjacentInlineEndInset(gapPx = 0) {
  const geometry = useDrawerGeometry();
  const { layoutViewportWidthPx: widthPx } = useViewportMetrics();

  if (!geometry) return null;

  return Math.max(0, widthPx - geometry.left) + gapPx;
}
