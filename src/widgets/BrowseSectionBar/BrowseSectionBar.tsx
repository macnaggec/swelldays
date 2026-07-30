import { IconMap, IconPhoto, IconStack2 } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { useDrawerAdjacentInlineEndInset } from 'shared/ui/DrawerShell';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { materialClasses } from 'shared/ui/design-system';
import styles from './BrowseSectionBar.module.css';

export type BrowseSection = 'sessions' | 'gallery';
export type BrowseDestination = 'map' | BrowseSection;

interface BrowseSectionBarStyle extends CSSProperties {
  '--wa-browse-section-drawer-inset': string;
}

interface BrowseSectionBarProps {
  active: BrowseDestination;
  avoidDrawer?: boolean;
  onMap: () => void;
  onSectionChange: (section: BrowseSection) => void;
}

function BrowseSectionNavigation({
  active,
  onMap,
  onSectionChange,
  drawerInset,
}: BrowseSectionBarProps & { drawerInset?: number }) {
  const { hidden: labelsHidden } = usePanelScrollChromeState();
  const style: BrowseSectionBarStyle | undefined = drawerInset !== undefined
    ? { '--wa-browse-section-drawer-inset': `${drawerInset}px` }
    : undefined;

  return (
    <nav
      className={`${styles.root} ${materialClasses.chrome}`}
      aria-label="Browse sections"
      data-compact={labelsHidden || undefined}
      data-drawer-adjacent={drawerInset !== undefined || undefined}
      style={style}
    >
      <button
        className={styles.item}
        type="button"
        aria-label="Map"
        aria-current={active === 'map' ? 'page' : undefined}
        onClick={onMap}
      >
        <IconMap size={20} aria-hidden="true" />
        {!labelsHidden && <span>Map</span>}
      </button>
      <button
        className={styles.item}
        type="button"
        aria-label="Feed"
        aria-current={active === 'sessions' ? 'page' : undefined}
        onClick={() => onSectionChange('sessions')}
      >
        <IconStack2 size={20} aria-hidden="true" />
        {!labelsHidden && <span>Feed</span>}
      </button>
      <button
        className={styles.item}
        type="button"
        aria-label="Gallery"
        aria-current={active === 'gallery' ? 'page' : undefined}
        onClick={() => onSectionChange('gallery')}
      >
        <IconPhoto size={20} aria-hidden="true" />
        {!labelsHidden && <span>Gallery</span>}
      </button>
    </nav>
  );
}

function DrawerAdjacentBrowseSectionBar(props: BrowseSectionBarProps) {
  const drawerInset = useDrawerAdjacentInlineEndInset();
  return <BrowseSectionNavigation {...props} drawerInset={drawerInset ?? 0} />;
}

export function BrowseSectionBar({
  avoidDrawer = false,
  ...props
}: BrowseSectionBarProps) {
  return avoidDrawer
    ? <DrawerAdjacentBrowseSectionBar {...props} />
    : <BrowseSectionNavigation {...props} />;
}
