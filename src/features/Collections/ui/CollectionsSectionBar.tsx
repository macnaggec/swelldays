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
 * The Uploads/Purchases/Favorites switcher is its own independent bar, never
 * merged with the account/cart icons — matching the main screen's own Map/
 * Feed/Gallery bar, which floats separately from them at every band. Its
 * caller chooses which of AppNavigation's two mount points to portal this
 * into (AppNavigationFloating vs AppNavigationSupplement) using the same
 * `navigation !== 'compactBar'` split this component uses for its own
 * presentation below — kept as one canonical field read twice, not two
 * independent formulas, since importing widgets/AppNavigation directly here
 * would invert the feature→widget dependency direction.
 *
 * At every band except landscape mobile (`compactBar`), it floats as its own
 * pill centered on the drawer's own measured horizontal midpoint — at wide
 * (`leftStrip`) that midpoint is the persistent panel's own center, same as
 * today; at portrait mobile (`topBar`), the drawer is `fullScreen`, so its
 * measured midpoint is simply the viewport's own center, landing the pill at
 * the screen's bottom center exactly like the main screen's own switcher.
 * Labels hide on scroll in both cases, matching that same reference bar.
 *
 * Landscape mobile (`compactBar`) is the one exception, and the only band
 * where the combined account/cart/switcher rail is the approved design: there
 * the drawer sits beside a narrow decorative map strip rather than filling
 * the screen, and the switcher docks directly below the account/cart buttons
 * instead — same left edge, same 44px width, real DOM flow, no positioning
 * math, labels always on since it isn't part of the panel's own scroll chrome.
 */
export function CollectionsSectionBar({ activeTab, onTabChange }: CollectionsSectionBarProps) {
  const usesFloatingPill = useAppShellLayoutPolicy().navigation !== 'compactBar';
  const geometry = useDrawerGeometry();
  const style: CollectionsSectionBarStyle | undefined = usesFloatingPill && geometry
    ? { '--wa-collections-switcher-center-x': `${geometry.left + geometry.width / 2}px` }
    : undefined;

  return (
    <SectionSwitcher
      className={styles.floating}
      aria-label="Collections sections"
      labelsHidden={usesFloatingPill ? undefined : false}
      data-avoid-drawer={!usesFloatingPill || undefined}
      style={style}
      items={items(activeTab, onTabChange)}
    />
  );
}
