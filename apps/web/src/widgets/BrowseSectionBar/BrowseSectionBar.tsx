import { IconMap, IconPhoto, IconStack2 } from '@tabler/icons-react';
import type { CSSProperties } from 'react';
import { useDrawerAdjacentInlineEndInset } from 'shared/ui/DrawerShell';
import { SectionSwitcher } from 'shared/ui/SectionSwitcher';
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
  onSectionIntent?: (section: BrowseSection) => void;
}

function BrowseSectionNavigation({
  active,
  onMap,
  onSectionChange,
  onSectionIntent,
  drawerInset,
}: BrowseSectionBarProps & { drawerInset?: number }) {
  const style: BrowseSectionBarStyle | undefined = drawerInset !== undefined
    ? { '--wa-browse-section-drawer-inset': `${drawerInset}px` }
    : undefined;

  return (
    <SectionSwitcher
      className={styles.root}
      aria-label="Browse sections"
      data-drawer-adjacent={drawerInset !== undefined || undefined}
      style={style}
      items={[
        {
          key: 'map',
          label: 'Map',
          icon: <IconMap size={20} aria-hidden="true" />,
          active: active === 'map',
          onClick: onMap,
        },
        {
          key: 'sessions',
          label: 'Feed',
          icon: <IconStack2 size={20} aria-hidden="true" />,
          active: active === 'sessions',
          onClick: () => onSectionChange('sessions'),
          onIntent: () => onSectionIntent?.('sessions'),
        },
        {
          key: 'gallery',
          label: 'Gallery',
          icon: <IconPhoto size={20} aria-hidden="true" />,
          active: active === 'gallery',
          onClick: () => onSectionChange('gallery'),
          onIntent: () => onSectionIntent?.('gallery'),
        },
      ]}
    />
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
