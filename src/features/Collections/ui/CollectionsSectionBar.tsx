import { IconHeart, IconShoppingBag, IconUpload } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { useDrawerGeometry } from 'shared/ui/DrawerShell';
import { SectionSwitcher } from 'shared/ui/SectionSwitcher';
import styles from './CollectionsSectionBar.module.css';

interface CollectionsSectionBarProps {
  activeTab: string;
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
 * The Uploads/Purchases/Favorites switcher's mount point is the same at every
 * band (AppNavigationSupplement, portaled into AppNavigation's own account/
 * cart stack) — only its own presentation changes, self-derived from the
 * shell's navigation presentation. At wide (`leftStrip`), it floats above the
 * gallery grid the same way the Map/Feed/Gallery bar floats above the map,
 * centered on the drawer's own measured horizontal midpoint rather than the
 * viewport's — pixel-identical to browse's existing floating pill. At every
 * other band, it instead docks directly below the account/cart buttons — same
 * left edge, same 44px width — reading as one vertical stack of app-level
 * controls, with no positioning math of its own since it's a real DOM child
 * of that stack. Labels stay on there (smaller, so they still fit the 44px
 * width) rather than hiding on scroll: this bar isn't part of the panel's own
 * scrolling chrome, so that scroll state isn't actually about it.
 */
export function CollectionsSectionBar({ activeTab, onTabChange }: CollectionsSectionBarProps) {
  const isWide = useAppShellLayoutPolicy().navigation === 'leftStrip';
  const geometry = useDrawerGeometry();
  const style: CollectionsSectionBarStyle | undefined = isWide && geometry
    ? { '--wa-collections-switcher-center-x': `${geometry.left + geometry.width / 2}px` }
    : undefined;

  return (
    <SectionSwitcher
      className={styles.floating}
      aria-label="Collections sections"
      labelsHidden={isWide ? undefined : false}
      data-avoid-drawer={!isWide || undefined}
      style={style}
      items={items(activeTab, onTabChange)}
    />
  );
}
