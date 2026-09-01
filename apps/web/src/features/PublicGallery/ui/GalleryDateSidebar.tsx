import { useMemo, type RefObject } from 'react';
import type { VirtualGalleryHandle } from 'shared/ui/VirtualGallery/VirtualGallery';
import { AppButton } from 'shared/ui/AppButton';
import {
  activeDayIndex,
  toDayHighlights,
  type GalleryDateHighlight,
} from '../model/galleryDateHighlights';
import { GalleryDateMonthList } from './GalleryDateMonthList';

interface GalleryDateSidebarProps {
  highlights: GalleryDateHighlight[];
  firstVisibleIndex: number;
  galleryRef: RefObject<VirtualGalleryHandle | null>;
  onJump?: (day: GalleryDateHighlight) => void;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function GalleryDateSidebar({
  highlights,
  firstVisibleIndex,
  galleryRef,
  onJump,
  isLoading,
  isError,
  onRetry,
}: GalleryDateSidebarProps) {
  const dayHighlights = useMemo(() => toDayHighlights(highlights), [highlights]);

  if (isLoading) return null;

  if (isError) {
    return (
      <div role="alert">
        <p>Dates unavailable</p>
        <AppButton onClick={onRetry}>Retry</AppButton>
      </div>
    );
  }

  // Exactly one month is unfolded: the month whose media is currently in view.
  // On load the gallery sits at its newest month, so that month opens first;
  // tapping a month scrolls its first shot into view, which makes it the open
  // one, and scrolling across a month boundary hands the open state over.
  const activeIdx = activeDayIndex(dayHighlights, firstVisibleIndex);
  const activeDay = dayHighlights[activeIdx];

  const jumpTo = (day: GalleryDateHighlight) => {
    if (onJump) {
      onJump(day);
      return;
    }
    const { rowIndex } = day;
    if (rowIndex !== null) galleryRef.current?.scrollToIndex(rowIndex, { align: 'start' });
  };

  return (
    <GalleryDateMonthList
      activeDay={activeDay}
      ariaLabel="Jump to date"
      dayHighlights={dayHighlights}
      orientation="vertical"
      onJump={jumpTo}
    />
  );
}
