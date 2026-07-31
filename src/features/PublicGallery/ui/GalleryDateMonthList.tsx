import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCapturedAtDate, getVisibleCalendarDayKey } from 'shared/lib/dateUtils';
import {
  groupDaysByMonth,
  monthKeyOf,
  type GalleryDateHighlight,
} from '../model/galleryDateHighlights';
import styles from './GalleryDateMonthList.module.css';

interface GalleryDateMonthListProps {
  activeDay: GalleryDateHighlight | undefined;
  ariaLabel: string;
  dayHighlights: GalleryDateHighlight[];
  orientation: 'horizontal' | 'vertical';
  onJump: (day: GalleryDateHighlight) => void;
}

/**
 * The shared month/day navigation rendered vertically beside a wide gallery
 * and horizontally inside the compact gallery's date menu.
 *
 * Both presentations open the active month initially. Tapping a month only
 * folds/unfolds its days for browsing — it never moves the gallery. Tapping
 * a day is the one action that jumps.
 */
export function GalleryDateMonthList({
  activeDay,
  ariaLabel,
  dayHighlights,
  orientation,
  onJump,
}: GalleryDateMonthListProps) {
  const months = useMemo(() => groupDaysByMonth(dayHighlights), [dayHighlights]);
  const activeMonthKey = activeDay ? monthKeyOf(activeDay.date) : months[0]?.key;
  // Browsing (which month is unfolded) is local and never scrolls the real
  // gallery. It re-syncs to the active month whenever a real jump changes it
  // elsewhere, but a plain month tap only toggles this local view.
  const [openMonth, setOpenMonth] = useState<{
    activeKey: string | undefined;
    openKey: string | undefined;
  }>(() => ({ activeKey: activeMonthKey, openKey: activeMonthKey }));
  const activeMonthChanged = openMonth.activeKey !== activeMonthKey;
  if (activeMonthChanged) {
    setOpenMonth({ activeKey: activeMonthKey, openKey: activeMonthKey });
  }
  const openKey = activeMonthChanged ? activeMonthKey : openMonth.openKey;
  const activeDayKey = activeDay ? getVisibleCalendarDayKey(activeDay.date) : undefined;
  const activeDayRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeDayRef.current?.scrollIntoView({
      block: 'nearest',
      inline: orientation === 'horizontal' ? 'center' : 'nearest',
      behavior: 'smooth',
    });
  }, [activeDayKey, orientation]);

  if (dayHighlights.length === 0) return null;

  const renderMonthControl = (
    month: (typeof months)[number],
    monthIndex: number,
  ) => {
    const isOpen = month.key === openKey;
    const previousMonth = months[monthIndex - 1];
    const showYear = !previousMonth
      || month.monthDate.getUTCFullYear() !== previousMonth.monthDate.getUTCFullYear();

    return (
      <div className={styles.monthGroup} key={month.key}>
        {showYear && (
          <span className={styles.year}>
            {month.monthDate.getUTCFullYear()}
          </span>
        )}
        <button
          type="button"
          className={`${styles.month} ${isOpen ? styles.monthOpen : ''}`}
          aria-expanded={isOpen}
          onClick={() => setOpenMonth((current) => ({
            activeKey: activeMonthKey,
            openKey: current.openKey === month.key ? undefined : month.key,
          }))}
          title={formatCapturedAtDate(month.monthDate, { month: 'long', year: 'numeric' })}
        >
          {formatCapturedAtDate(month.monthDate, { month: 'short' })}
        </button>
      </div>
    );
  };

  const renderDays = (month: (typeof months)[number]) => month.days.map((day) => {
    const isActive = month.key === activeMonthKey
      && getVisibleCalendarDayKey(day.date) === activeDayKey;

    return (
      <button
        type="button"
        key={day.date.toISOString()}
        ref={isActive ? activeDayRef : undefined}
        className={`${styles.day} ${isActive ? styles.dayActive : ''}`}
        aria-current={isActive ? 'date' : undefined}
        onClick={() => onJump(day)}
        title={formatCapturedAtDate(day.date)}
      >
        {formatCapturedAtDate(day.date, { day: 'numeric' })}
      </button>
    );
  });

  if (orientation === 'horizontal') {
    const openMonth = months.find((month) => month.key === openKey);

    return (
      <nav className={`${styles.navigation} ${styles.horizontal}`} aria-label={ariaLabel}>
        <div
          className={styles.monthRow}
          role="group"
          aria-label="Months"
          data-scroll-direction-isolated
        >
          {months.map(renderMonthControl)}
        </div>
        {openMonth && (
          <div
            className={styles.dayRow}
            role="group"
            aria-label="Days"
            data-scroll-direction-isolated
          >
            {renderDays(openMonth)}
          </div>
        )}
      </nav>
    );
  }

  return (
    <nav className={`${styles.navigation} ${styles.vertical}`} aria-label={ariaLabel}>
      {months.map((month, monthIndex) => {
        return (
          <div className={styles.verticalMonthGroup} key={month.key}>
            {renderMonthControl(month, monthIndex)}
            {month.key === openKey && renderDays(month)}
          </div>
        );
      })}
    </nav>
  );
}
