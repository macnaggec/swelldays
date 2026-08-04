import type { CSSProperties, ReactElement } from 'react';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
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
  sheetSnap?: SheetSnap;
  placement?: BrowseSheetNavigationPlacement;
}

function NavigationSurface({
  presentation,
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

  return (
    <div
      className={styles.root}
      data-navigation-presentation={presentation}
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
      </div>
    </div>
  );
}

function BrowseSheetNavigation(): ReactElement {
  const { snap } = useBrowseSurface();
  const placement = useBrowseSheetNavigationPlacement(snap);

  return (
    <NavigationSurface presentation="topBar" sheetSnap={snap} placement={placement} />
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
  return <NavigationSurface presentation={presentation} />;
}

export default AppNavigation;
