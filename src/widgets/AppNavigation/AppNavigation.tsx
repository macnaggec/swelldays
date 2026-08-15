import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useCartStore } from 'entities/Commerce';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import {
  publishNavigationFloatingTarget,
  useNavigationFloatingTarget,
} from 'shared/model/navigationFloatingTarget';
import { publishNavigationRailGeometry } from 'shared/model/navigationRailGeometry';
import {
  publishNavigationSupplementTarget,
  useNavigationSupplementTarget,
} from 'shared/model/navigationSupplementTarget';
import styles from './AppNavigation.module.css';
import {
  useBrowseSheetNavigationPlacement,
  useBrowseSurface,
  type BrowseSheetNavigationPlacement,
  type SheetSnap,
} from 'shared/ui/DrawerShell';
import { CartControl } from './CartControl';
import { MenuControl } from './MenuControl';

export interface AppNavigationProps {
  presentation: AppShellLayoutPolicy['navigation'];
  drawerPresentation: AppShellLayoutPolicy['drawer']['presentation'];
}

interface BrowseNavigationStyle extends CSSProperties {
  '--wa-browse-sheet-top': string;
  '--wa-browse-navigation-opacity': string;
}

interface NavigationSurfaceProps {
  presentation: Exclude<AppShellLayoutPolicy['navigation'], 'hidden'>;
  drawerPresentation: AppShellLayoutPolicy['drawer']['presentation'];
  sheetSnap?: SheetSnap;
  placement?: BrowseSheetNavigationPlacement;
}

function NavigationSurface({
  presentation,
  drawerPresentation,
  sheetSnap,
  placement,
}: NavigationSurfaceProps): ReactElement {
  const hidden = placement?.hidden ?? false;
  const style: BrowseNavigationStyle | undefined = placement === undefined
    ? undefined
    : {
      '--wa-browse-sheet-top': `${placement.topPx}px`,
      '--wa-browse-navigation-opacity': `${placement.opacity}`,
    };

  const cartItemCount = useCartStore((state) => state.items.length);

  const rootRef = useRef<HTMLDivElement>(null);
  // A ref callback, not useState: AppNavigation and routed content mount as
  // siblings at the composition root, so a React Context Provider scoped to
  // this subtree could never reach a route-rendered AppNavigationSupplement
  // consumer. React invokes this with the node on mount/update and with null
  // on unmount, so no separate cleanup effect is needed.
  const setSupplementTarget = useCallback((node: HTMLDivElement | null) => {
    publishNavigationSupplementTarget(node);
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let pendingFrame: number | null = null;
    const measure = () => {
      pendingFrame = null;
      publishNavigationRailGeometry(root.getBoundingClientRect());
    };
    const scheduleMeasurement = () => {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasurement);

    observer.observe(root);
    scheduleMeasurement();

    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      publishNavigationRailGeometry(null);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-navigation-presentation={presentation}
      data-drawer-presentation={drawerPresentation}
      data-sheet-snap={sheetSnap}
      data-navigation-tracking={placement?.live || undefined}
      style={style}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      <div className={styles.stack}>
        <div className={styles.button}>
          <MenuControl />
        </div>
        {/* Mounted only once the cart has items, so an empty cart doesn't reserve a
            slot — the stack's own measured box (see the ResizeObserver above)
            shrinks with it, and anything sized against that measurement, like the
            floating filter pills over the map, reclaims the freed width. */}
        {cartItemCount > 0 && (
          <div className={styles.button}>
            <CartControl />
          </div>
        )}
        <div ref={setSupplementTarget} className={styles.supplement} />
      </div>
    </div>
  );
}

/**
 * Mounted unconditionally by AppNavigation, independent of whether the rail
 * itself renders (`presentation === 'hidden'` on most non-browse routes at
 * portrait mobile) — a switcher pill that floats independently of the rail
 * (AppNavigationFloating) must still have somewhere to portal into even when
 * there is no rail. Also a plain sibling of `.root`, not a descendant of it:
 * `.root` always carries a `transform` (even at its resting translateY(0),
 * for browse-sheet tracking), which makes it the containing block for any
 * `position: fixed` descendant — content that positions itself against the
 * real viewport needs to mount outside that box regardless.
 */
function FloatingTargetAnchor(): ReactElement {
  const setFloatingTarget = useCallback((node: HTMLDivElement | null) => {
    publishNavigationFloatingTarget(node);
  }, []);

  return <div ref={setFloatingTarget} />;
}

/**
 * A mount point inside AppNavigation's own menu/cart stack, below its
 * buttons — for route-owned navigation content that belongs in real
 * DOM flow there (e.g. a switcher docked below the icons on a landscape
 * phone). Renders nothing when mounted outside AppNavigation.
 */
export function AppNavigationSupplement({ children }: { children: ReactNode }): ReactElement | null {
  const target = useNavigationSupplementTarget();
  return target ? createPortal(children, target) : null;
}

/**
 * A mount point beside AppNavigation's own menu/cart stack, not inside it
 * — for content that positions itself with `position: fixed` against the
 * real viewport (e.g. a switcher pill centered over the drawer). Renders
 * nothing when mounted outside AppNavigation.
 */
export function AppNavigationFloating({ children }: { children: ReactNode }): ReactElement | null {
  const target = useNavigationFloatingTarget();
  return target ? createPortal(children, target) : null;
}

function BrowseSheetNavigation(): ReactElement {
  const { snap } = useBrowseSurface();
  const placement = useBrowseSheetNavigationPlacement(snap);

  return (
    <NavigationSurface
      presentation="topBar"
      drawerPresentation="bottomSheet"
      sheetSnap={snap}
      placement={placement}
    />
  );
}

export function AppNavigation({
  presentation,
  drawerPresentation,
}: AppNavigationProps): ReactElement {
  return (
    <>
      {presentation === 'hidden' ? null : presentation === 'topBar' && drawerPresentation === 'bottomSheet' ? (
        <BrowseSheetNavigation />
      ) : (
        <NavigationSurface presentation={presentation} drawerPresentation={drawerPresentation} />
      )}
      <FloatingTargetAnchor />
    </>
  );
}

export default AppNavigation;
