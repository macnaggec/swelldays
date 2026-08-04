import { Select } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import styles from './CollectionsToolbar.module.css';

type SpotOption = {
  value: string;
  label: string;
};

type CollectionsToolbarProps = {
  activeTab: string;
  spotOptions: SpotOption[];
  spotFilter: string | null;
  onSpotFilterChange: (spotId: string | null) => void;
  /** Centers the select in its host row. Off when the header-trailing slot's own
   * right alignment already places it, since an auto-margin centering it here would
   * fight that flex alignment. */
  centered?: boolean;
};

export function CollectionsToolbar({
  activeTab,
  spotOptions,
  spotFilter,
  onSpotFilterChange,
  centered = false,
}: CollectionsToolbarProps) {
  if (!(activeTab === 'uploads' || activeTab === 'favorites') || spotOptions.length <= 1) return null;

  return (
    <Select
      data-testid="collections-toolbar"
      aria-label={activeTab === 'favorites' ? 'Filter favorites by spot' : 'Filter uploads by spot'}
      className={centered ? `${styles.spotSelect} ${styles.spotSelectCentered}` : styles.spotSelect}
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
