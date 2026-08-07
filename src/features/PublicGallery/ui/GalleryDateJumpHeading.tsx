import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { formatCapturedAtDate, getVisibleCalendarDayKey } from 'shared/lib/dateUtils';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { materialClasses } from 'shared/ui/design-system';
import {
  toDayHighlights,
  type GalleryDateHighlight,
} from '../model/galleryDateHighlights';
import { GalleryDateMonthList } from './GalleryDateMonthList';
import styles from './GalleryDateJumpHeading.module.css';

interface GalleryDateJumpHeadingProps {
  date: Date;
  dayHighlights: GalleryDateHighlight[];
  onJump: (day: GalleryDateHighlight) => void;
}

// Decoupled from the trigger's own (deliberately narrow) width: Mantine's width="target"
// makes the dropdown match the closed bar exactly, too narrow to show more than a few
// months/days at once. clamp(), not min() — Mantine's rem() unit converter passes calc()/
// clamp()/rgba() strings through untouched, but naively splits any other string on its
// top-level commas, which would mangle a min(a, b) value.
const DROPDOWN_WIDTH = 'clamp(280px, calc(100vw - 2 * var(--wa-panel-content-inset)), 400px)';

/**
 * The active-date control shown in the panel's shared chrome slot whenever the
 * wide date rail doesn't fit (mobile drawer or a narrowed desktop panel):
 * tapping it opens the same grouped month/day list as the wide rail.
 */
export function GalleryDateJumpHeading({ date, dayHighlights, onJump }: GalleryDateJumpHeadingProps) {
  const [opened, setOpened] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { pinChromeHidden } = usePanelScrollChromeState();

  // This bar is only reachable while it's already the visible chrome; opening
  // its menu must not let scrolling the gallery beneath swap it back out
  // (and orphan the open menu from its trigger) until the menu closes again.
  useEffect(() => {
    pinChromeHidden?.(opened);
    return () => pinChromeHidden?.(false);
  }, [opened, pinChromeHidden]);
  const uniqueDays = useMemo(() => toDayHighlights(dayHighlights), [dayHighlights]);
  const activeDayKey = getVisibleCalendarDayKey(date);
  const activeDay = uniqueDays.find(
    (day) => getVisibleCalendarDayKey(day.date) === activeDayKey,
  ) ?? uniqueDays[0];

  // A month/day pick is a completed interaction, not a step toward one: close
  // immediately and return focus to the bar that opened it, rather than
  // leaving the menu open over the jump the way a plain onJump would.
  const handleJump = (day: GalleryDateHighlight) => {
    onJump(day);
    setOpened(false);
    triggerRef.current?.focus();
  };

  return (
    <Menu
      position="bottom-start"
      shadow="md"
      opened={opened}
      onChange={setOpened}
      width={DROPDOWN_WIDTH}
    >
      <Menu.Target>
        <button
          ref={triggerRef}
          type="button"
          className={`${styles.heading} ${materialClasses.panelControl}`}
          aria-label="Jump to date"
        >
          <span className={styles.headingText}>
            {formatCapturedAtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <IconChevronDown size={14} className={styles.headingIcon} aria-hidden="true" />
        </button>
      </Menu.Target>
      <Menu.Dropdown className={styles.dropdown}>
        <GalleryDateMonthList
          activeDay={activeDay}
          ariaLabel="Dates"
          dayHighlights={uniqueDays}
          orientation="horizontal"
          onJump={handleJump}
        />
      </Menu.Dropdown>
    </Menu>
  );
}
