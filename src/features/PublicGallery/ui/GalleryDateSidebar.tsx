import React, { useEffect, useMemo, useRef } from 'react';
import type { VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';
import {
  activeDayIndex,
  groupDaysByMonth,
  monthKeyOf,
  toDayHighlights,
  type GalleryDateHighlight,
} from '../model/galleryDateHighlights';
import styles from './GalleryDateSidebar.module.css';

interface GalleryDateSidebarProps {
  highlights: GalleryDateHighlight[];
  firstVisibleIndex: number;
  galleryRef: React.RefObject<VirtualGalleryHandle | null>;
}

export function GalleryDateSidebar({ highlights, firstVisibleIndex, galleryRef }: GalleryDateSidebarProps) {
  const dayHighlights = useMemo(() => toDayHighlights(highlights), [highlights]);
  const months = useMemo(() => groupDaysByMonth(dayHighlights), [dayHighlights]);

  // Exactly one month is unfolded: the month whose media is currently in view.
  // On load the gallery sits at its newest month, so that month opens first;
  // tapping a month scrolls its first shot into view, which makes it the open
  // one, and scrolling across a month boundary hands the open state over.
  const activeIdx = activeDayIndex(dayHighlights, firstVisibleIndex);
  const activeDay = dayHighlights[activeIdx];
  const openKey = activeDay ? monthKeyOf(activeDay.date) : months[0]?.key;

  const jumpTo = (rowIndex: number) => galleryRef.current?.scrollToIndex(rowIndex, { align: 'start' });

  // Keep the active day in the independently-scrolling rail's visible window.
  const activeDayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeDayRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIdx]);

  if (dayHighlights.length === 0) return null;

  return (
    <nav className={styles.sidebar} aria-label="Jump to date">
      {months.map((month, mi) => {
        const isOpen = month.key === openKey;
        const prevMonth = mi > 0 ? months[mi - 1] : null;
        const showYear = !prevMonth || month.monthDate.getFullYear() !== prevMonth.monthDate.getFullYear();

        return (
          <React.Fragment key={month.key}>
            {showYear && <span className={styles.sidebarYear}>{month.monthDate.getFullYear()}</span>}
            <button
              className={`${styles.monthHeader} ${isOpen ? styles.monthHeaderOpen : ''}`}
              aria-expanded={isOpen}
              onClick={() => jumpTo(month.days[0]!.rowIndex)}
              title={month.monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            >
              {month.monthDate.toLocaleDateString(undefined, { month: 'short' })}
            </button>

            {isOpen && month.days.map((day) => {
              const isActiveDay = day.rowIndex === activeDay?.rowIndex;
              return (
                <button
                  key={day.date.toISOString()}
                  ref={isActiveDay ? activeDayRef : undefined}
                  className={`${styles.sidebarBtn} ${isActiveDay ? styles.sidebarBtnActive : ''}`}
                  onClick={() => jumpTo(day.rowIndex)}
                  title={day.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                >
                  <span className={styles.sidebarDay}>
                    {day.date.toLocaleDateString(undefined, { day: 'numeric' })}
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
