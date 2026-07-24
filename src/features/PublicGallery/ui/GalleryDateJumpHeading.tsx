import { Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import type { GalleryDateHighlight } from '../model/galleryDateHighlights';
import styles from './GalleryDateJumpHeading.module.css';

interface GalleryDateJumpHeadingProps {
  date: Date;
  dayHighlights: GalleryDateHighlight[];
  onJump: (rowIndex: number) => void;
}

/**
 * Date-section heading that doubles as the below-rail-capability jump control
 * (F12g): rendered as the gallery's divider rows (the current one pinned by
 * VirtualGallery's sticky mode), tapping it opens the list of dates to jump to.
 */
export function GalleryDateJumpHeading({ date, dayHighlights, onJump }: GalleryDateJumpHeadingProps) {
  return (
    <Menu position="bottom-start" shadow="md">
      <Menu.Target>
        <button type="button" className={styles.heading} aria-label="Jump to date">
          <span className={styles.headingText}>
            {date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <IconChevronDown size={14} className={styles.headingIcon} aria-hidden="true" />
        </button>
      </Menu.Target>
      <Menu.Dropdown className={styles.dropdown}>
        {dayHighlights.map(({ date: itemDate, rowIndex }) => (
          <Menu.Item key={itemDate.toISOString()} onClick={() => onJump(rowIndex)}>
            {itemDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
