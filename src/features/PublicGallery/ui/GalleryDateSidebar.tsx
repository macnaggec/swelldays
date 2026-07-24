import React, { useEffect, useMemo, useRef } from 'react';
import type { VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';
import { activeDayIndex, toDayHighlights, type GalleryDateHighlight } from '../model/galleryDateHighlights';
import styles from './GalleryDateSidebar.module.css';

interface GalleryDateSidebarProps {
  highlights: GalleryDateHighlight[];
  firstVisibleIndex: number;
  galleryRef: React.RefObject<VirtualGalleryHandle | null>;
}

const SIDEBAR_MAX = 12;

export function GalleryDateSidebar({ highlights, firstVisibleIndex, galleryRef }: GalleryDateSidebarProps) {
  const dayHighlights = useMemo(() => toDayHighlights(highlights), [highlights]);

  const useMonths = dayHighlights.length > SIDEBAR_MAX;

  const sidebarGroups = useMemo(() => {
    if (!useMonths) return dayHighlights.map((h, i) => ({ ...h, originalIndex: i }));
    const seen = new Set<string>();
    return dayHighlights
      .map((h, i) => ({ ...h, originalIndex: i }))
      .filter(({ date }) => {
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [dayHighlights, useMonths]);

  const activeHighlightIndex = useMemo(
    () => activeDayIndex(dayHighlights, firstVisibleIndex),
    [firstVisibleIndex, dayHighlights],
  );

  const activeSidebarIndex = useMemo(() => {
    if (!useMonths) return activeHighlightIndex;
    let active = 0;
    const activeRowIndex = dayHighlights[activeHighlightIndex]?.rowIndex ?? 0;
    for (let i = 0; i < sidebarGroups.length; i++) {
      if (sidebarGroups[i]!.rowIndex <= activeRowIndex) active = i;
      else break;
    }
    return active;
  }, [useMonths, sidebarGroups, activeHighlightIndex, dayHighlights]);

  const activeBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeBtnRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeSidebarIndex]);

  if (dayHighlights.length === 0) return null;

  return (
    <nav className={styles.sidebar} aria-label="Jump to date">
      {sidebarGroups.map(({ date, rowIndex }, i) => {
        const isActive = i === activeSidebarIndex;
        const prevDate = i > 0 ? sidebarGroups[i - 1]!.date : null;
        const showYear = !prevDate || date.getFullYear() !== prevDate.getFullYear();

        return (
          <React.Fragment key={date.toISOString()}>
            {showYear && (
              <span className={styles.sidebarYear}>{date.getFullYear()}</span>
            )}
            <button
              ref={isActive ? activeBtnRef : undefined}
              className={`${styles.sidebarBtn} ${isActive ? styles.sidebarBtnActive : ''}`}
              onClick={() => galleryRef.current?.scrollToIndex(rowIndex, { align: 'start' })}
              title={date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            >
              <span className={styles.sidebarMonth}>
                {date.toLocaleDateString(undefined, { month: 'short' })}
              </span>
              {!useMonths && (
                <span className={styles.sidebarDay}>
                  {date.toLocaleDateString(undefined, { day: 'numeric' })}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
