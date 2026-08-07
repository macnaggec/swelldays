import {
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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
import { materialClasses } from 'shared/ui/design-system';
import {
  useBrowseSheetNavigationPlacement,
  useBrowseSurface,
  type BrowseSheetNavigationPlacement,
  type SheetSnap,
} from 'shared/ui/DrawerShell';
import { CartControl } from './CartControl';
import { UserControl } from './UserControl';

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

  const rootRef = useRef<HTMLDivElement>(null);
  // A ref callback, not useState: AppNavigation and routed content mount as
  // siblings at the composition root, so a React Context Provider scoped to
  // this subtree could never reach a route-rendered AppNavigationSupplement
  // consumer. React invokes this with the node on mount/update and with null
  // on unmount, so no separate cleanup effect is needed.
  const setSupplementTarget = useCallback((node: HTMLDivElement | null) => {
    publishNavigationSupplementTarget(node);
  }, []);
  // A plain sibling of `.root`, not a descendant — `.root` always carries a
  // `transform` (even at its resting translateY(0), for browse-sheet
  // tracking), which makes it the containing block for any `position: fixed`
  // descendant. Content that needs to position itself against the real
  // viewport (AppNavigationFloating) mounts here instead of inside `.root`.
  const setFloatingTarget = useCallback((node: HTMLDivElement | null) => {
    publishNavigationFloatingTarget(node);
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
    <>
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
        <div className={`${styles.stack} ${materialClasses.chrome}`}>
          <div className={styles.button}>
            <UserControl />
          </div>
          {/* Reserved even when the cart is empty (CartControl renders nothing then) so
              adding the first item doesn't shift the account button or anything docked
              beneath this bar. */}
          <div className={styles.button}>
            <CartControl />
          </div>
          <div ref={setSupplementTarget} className={styles.supplement} />
        </div>
      </div>
      <div ref={setFloatingTarget} />
    </>
  );
}

/**
 * A mount point inside AppNavigation's own account/cart stack, below the two
 * reserved buttons — for route-owned navigation content that belongs in real
 * DOM flow there (e.g. a switcher docked below the icons on a landscape
 * phone). Renders nothing when mounted outside AppNavigation.
 */
export function AppNavigationSupplement({ children }: { children: ReactNode }): ReactElement | null {
  const target = useNavigationSupplementTarget();
  return target ? createPortal(children, target) : null;
}

/**
 * A mount point beside AppNavigation's own account/cart stack, not inside it
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
}: AppNavigationProps): ReactElement | null {
  if (presentation === 'hidden') return null;
  if (presentation === 'topBar' && drawerPresentation === 'bottomSheet') {
    return <BrowseSheetNavigation />;
  }
  return <NavigationSurface presentation={presentation} drawerPresentation={drawerPresentation} />;
}

export default AppNavigation;
