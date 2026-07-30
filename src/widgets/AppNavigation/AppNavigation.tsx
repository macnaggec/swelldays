import type { CSSProperties, ReactElement } from 'react';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import styles from './AppNavigation.module.css';
import { materialClasses } from 'shared/ui/design-system';
import {
  useBrowseSurface,
  useSheetSnapTopPx,
  type SheetSnap,
} from 'shared/ui/DrawerShell';
import { useCartStore } from 'entities/Commerce';
import { CartControl } from './CartControl';
import { UserControl } from './UserControl';

export interface AppNavigationProps {
  presentation: AppShellLayoutPolicy['navigation'];
  drawerPresentation: AppShellLayoutPolicy['drawer']['presentation'];
}

interface BrowseNavigationStyle extends CSSProperties {
  '--wa-browse-sheet-top': string;
}

interface NavigationSurfaceProps {
  presentation: Exclude<AppShellLayoutPolicy['navigation'], 'hidden'>;
  sheetSnap?: SheetSnap;
  sheetTopPx?: number;
}

function NavigationSurface({
  presentation,
  sheetSnap,
  sheetTopPx,
}: NavigationSurfaceProps): ReactElement {
  const cartCount = useCartStore((s) => s.items.length);
  const isBrowseSheetFull = sheetSnap === 'full';
  const style: BrowseNavigationStyle | undefined = sheetTopPx === undefined
    ? undefined
    : { '--wa-browse-sheet-top': `${sheetTopPx}px` };

  return (
    <div
      className={styles.root}
      data-navigation-presentation={presentation}
      data-sheet-snap={sheetSnap}
      style={style}
      inert={isBrowseSheetFull}
      aria-hidden={isBrowseSheetFull || undefined}
    >
      <div className={`${styles.stack} ${materialClasses.chrome}`}>
        <div className={styles.button}>
          <UserControl />
        </div>
        {cartCount > 0 && (
          <div className={styles.button}>
            <CartControl />
          </div>
        )}
      </div>
    </div>
  );
}

function BrowseSheetNavigation(): ReactElement {
  const { snap } = useBrowseSurface();
  const sheetTopPx = useSheetSnapTopPx(snap);

  return (
    <NavigationSurface
      presentation="topBar"
      sheetSnap={snap}
      sheetTopPx={sheetTopPx}
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
  return <NavigationSurface presentation={presentation} />;
}

export default AppNavigation;
