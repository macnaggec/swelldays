import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { getVisibleCalendarDayKey } from 'shared/lib/dateUtils';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import {
  groupDaysByMonth,
  toDayHighlights,
  type GalleryDateHighlight,
} from '../model/galleryDateHighlights';
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
  const { drawerPresentation } = usePanelScrollChromeState();
  const usesHorizontalRail = drawerPresentation === 'bottomSheet'
    || drawerPresentation === 'sideOverlay';
  const [opened, setOpened] = useState(false);
  const uniqueDays = useMemo(() => toDayHighlights(dayHighlights), [dayHighlights]);
  const months = useMemo(() => groupDaysByMonth(uniqueDays), [uniqueDays]);
  const activeDayKey = getVisibleCalendarDayKey(date);
  const activeDayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!opened || !usesHorizontalRail) return;
    activeDayRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [activeDayKey, opened, usesHorizontalRail]);

  return (
    <Menu
      position="bottom-start"
      shadow="md"
      opened={opened}
      onChange={setOpened}
      width={usesHorizontalRail ? 'target' : undefined}
    >
      <Menu.Target>
        <button type="button" className={styles.heading} aria-label="Jump to date">
          <span className={styles.headingText}>
            {date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
          <IconChevronDown size={14} className={styles.headingIcon} aria-hidden="true" />
        </button>
      </Menu.Target>
      <Menu.Dropdown className={styles.dropdown}>
        {usesHorizontalRail ? (
          <nav className={styles.dateStrip} aria-label="Dates">
            {months.map((month, monthIndex) => {
              const previousMonth = months[monthIndex - 1];
              const showYear = !previousMonth
                || month.monthDate.getFullYear() !== previousMonth.monthDate.getFullYear();

              return (
                <div className={styles.dateMonthGroup} key={month.key}>
                  {showYear && (
                    <span className={styles.dateYear}>
                      {month.monthDate.getFullYear()}
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.dateMonth}
                    onClick={() => onJump(month.days[0]!.rowIndex)}
                    title={month.monthDate.toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })}
                  >
                    {month.monthDate.toLocaleDateString(undefined, { month: 'short' })}
                  </button>
                  {month.days.map((day) => {
                    const isActive = getVisibleCalendarDayKey(day.date) === activeDayKey;

                    return (
                      <button
                        type="button"
                        key={day.date.toISOString()}
                        ref={isActive ? activeDayRef : undefined}
                        className={styles.dateDay}
                        aria-current={isActive ? 'date' : undefined}
                        onClick={() => onJump(day.rowIndex)}
                        title={day.date.toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      >
                        {day.date.toLocaleDateString(undefined, { day: 'numeric' })}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        ) : uniqueDays.map(({ date: itemDate, rowIndex }) => (
          <Menu.Item key={itemDate.toISOString()} onClick={() => onJump(rowIndex)}>
            {itemDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
