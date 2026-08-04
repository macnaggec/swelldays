import { IconHeart, IconShoppingBag, IconUpload } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { useDrawerGeometry } from 'shared/ui/DrawerShell';
import { SectionSwitcher } from 'shared/ui/SectionSwitcher';
import styles from './CollectionsSectionBar.module.css';

interface CollectionsSectionBarProps {
  activeTab: string;
  /** True when the drawer is a side overlay beside the map (e.g. landscape phone) — the
   * switcher docks below the account button in the remaining map area instead of
   * centering over the panel. */
  avoidDrawer?: boolean;
  onTabChange: (tab: string | null) => void;
}

interface CollectionsSectionBarStyle extends CSSProperties {
  '--wa-collections-switcher-center-x'?: string;
}

const items = (activeTab: string, onTabChange: (tab: string | null) => void) => [
  {
    key: 'uploads',
    label: 'Uploads',
    icon: <IconUpload size={20} aria-hidden="true" />,
    active: activeTab === 'uploads',
    onClick: () => onTabChange('uploads'),
  },
  {
    key: 'purchases',
    label: 'Purchases',
    icon: <IconShoppingBag size={20} aria-hidden="true" />,
    active: activeTab === 'purchases',
    onClick: () => onTabChange('purchases'),
  },
  {
    key: 'favorites',
    label: 'Favorites',
    icon: <IconHeart size={20} aria-hidden="true" />,
    active: activeTab === 'favorites',
    onClick: () => onTabChange('favorites'),
  },
];

/**
 * The Uploads/Purchases/Favorites switcher floats above the gallery grid the
 * same way the Map/Feed/Gallery bar floats above the map. By default it is
 * centered on the drawer's own measured horizontal midpoint rather than the
 * viewport's — this switcher belongs to the panel's content, not the app
 * shell, so the grid keeps scrolling underneath it instead of losing space
 * to a reserved footer row. When the drawer is a side overlay beside the map
 * (`avoidDrawer`), it instead docks directly below the account button — same
 * left edge, same 44px width — so the two read as one vertical stack of
 * app-level controls beside the map rather than two independently placed
 * floating elements. Labels stay on (smaller, so they still fit the 44px
 * width) rather than hiding on scroll: this bar isn't part of the panel's
 * own scrolling chrome, so that scroll state isn't actually about it.
 */
export function CollectionsSectionBar({ activeTab, avoidDrawer = false, onTabChange }: CollectionsSectionBarProps) {
  const geometry = useDrawerGeometry();
  const style: CollectionsSectionBarStyle | undefined = !avoidDrawer && geometry
    ? { '--wa-collections-switcher-center-x': `${geometry.left + geometry.width / 2}px` }
    : undefined;

  return (
    <SectionSwitcher
      className={styles.floating}
      aria-label="Collections sections"
      labelsHidden={avoidDrawer ? false : undefined}
      data-avoid-drawer={avoidDrawer || undefined}
      style={style}
      items={items(activeTab, onTabChange)}
    />
  );
}
