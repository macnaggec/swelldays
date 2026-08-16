import { Select } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import type { CollectionTab } from '../model/CollectionTab';
import styles from './CollectionsToolbar.module.css';

type SpotOption = {
  value: string;
  label: string;
};

type CollectionsToolbarProps = {
  activeTab: CollectionTab;
  spotOptions: SpotOption[];
  spotFilter: string | null;
  onSpotFilterChange: (spotId: string | null) => void;
  /** Centers the select in its host row. Off when the header-trailing slot's own
   * right alignment already places it, since an auto-margin centering it here would
   * fight that flex alignment. */
  centered?: boolean;
  /** Desktop's header-trailing slot, where this control sits beside the switcher
   * at the same height and needs none of the landscape workspace header's own
   * centering margin. Ignored when `centered` is set. */
  desktopHeader?: boolean;
};

export function CollectionsToolbar({
  activeTab,
  spotOptions,
  spotFilter,
  onSpotFilterChange,
  centered = false,
  desktopHeader = false,
}: CollectionsToolbarProps) {
  if (!(activeTab === 'uploads' || activeTab === 'favorites') || spotOptions.length <= 1) return null;

  return (
    <Select
      data-testid="collections-toolbar"
      aria-label={activeTab === 'favorites' ? 'Filter favorites by spot' : 'Filter uploads by spot'}
      className={centered
        ? `${styles.spotSelect} ${styles.spotSelectCentered}`
        : desktopHeader
          ? `${styles.spotSelect} ${styles.spotSelectHeaderDesktop}`
          : `${styles.spotSelect} ${styles.spotSelectHeader}`}
      classNames={{ option: styles.spotSelectOption }}
      // Mantine's Input theme forces 16px on every input's font-size so real
      // text fields don't trigger iOS Safari's zoom-on-focus. This dropdown is
      // never typed into (not `searchable`, so Mantine renders it read-only),
      // so that floor doesn't apply — override it per-instance rather than in
      // the stylesheet, since an inline style can't be beaten by a CSS class.
      styles={{ input: { fontSize: 'var(--wa-font-size-xs)' } }}
      placeholder="All spots"
      data={spotOptions}
      value={spotFilter}
      onChange={onSpotFilterChange}
      clearable
      size="xs"
      radius="xl"
      leftSection={<IconMapPin size={13} />}
    />
  );
}
