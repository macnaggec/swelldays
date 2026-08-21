export {
  DrawerShell,
  type DrawerShellModality,
  type DrawerShellPanelPresentation,
  type DrawerShellPresentation,
  type DrawerShellProps,
} from './DrawerShell';
export {
  getDrawerGeometrySnapshot,
  subscribeDrawerGeometry,
  useDrawerAdjacentInlineEndInset,
  useDrawerDragging,
  useDrawerMoving,
  useDrawerGeometry,
  useDrawerSheetSnap,
  useDrawerTargetGeometry,
  type DrawerGeometry,
} from './geometry';
export { DRAWER_SHELL_TRANSITION } from './motion';
/*
 * Only the snap *vocabulary* is public. The heights, fractions, and landing decision
 * stay internal on purpose: `drawer-shell-owns-sheet-snap-geometry` forbids every
 * module outside this folder from naming them, so exporting them would advertise an
 * API the gate rejects at the first consumer.
 */
export { type SheetSnap } from './sheetSnapPolicy';
export {
  BrowseSurfaceProvider,
  useBrowseSurface,
} from './browseSurface';
export {
  useBrowseSheetNavigationPlacement,
  type BrowseSheetNavigationPlacement,
} from './useBrowseSheetNavigationPlacement';
export {
  useRegisterSheetScrollOwner,
  useSheetContentScrollable,
} from './sheetScrollCoupling';
