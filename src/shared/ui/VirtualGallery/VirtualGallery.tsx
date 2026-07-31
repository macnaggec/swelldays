import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader } from '@mantine/core';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import type { CardContext } from 'shared/ui/BaseGallery/BaseGallery';
import SelectionCheckbox from 'shared/ui/BaseGallery/SelectionCheckbox';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { formatCapturedAtDate } from 'shared/lib/dateUtils';
import styles from './VirtualGallery.module.css';

const DIVIDER_HEIGHT = 32;
const CARD_ROW_ESTIMATE = 220;
const ACTIVE_ROW_ANCHOR_RATIO = 0.2;

interface MeasuredVirtualRow {
  index: number;
  start: number;
  size: number;
}

export function getAnchoredVisibleRowIndex(
  virtualItems: MeasuredVirtualRow[],
  scrollTop: number,
  viewportHeight: number,
) {
  const anchorOffset = scrollTop + (viewportHeight * ACTIVE_ROW_ANCHOR_RATIO);
  return virtualItems.find((vi) => vi.start + vi.size > anchorOffset)?.index ?? 0;
}

/**
 * Resolves the element that actually scrolls this gallery: the nearest ancestor
 * declared as the panel scroll owner (see shared/ui/PanelLayout), or `node`
 * itself when no such ancestor exists (e.g. a standalone usage in a test).
 *
 * PanelLayout's scroll-owner contract leaves this component's own box
 * unconstrained, so it never scrolls itself — targeting it anyway silently
 * freezes the virtualizer's visible window and makes scrollToIndex a no-op.
 */
export function resolveGalleryScrollOwner(node: HTMLElement): HTMLElement {
  return node.closest<HTMLElement>('[data-panel-scroll-owner]') ?? node;
}

interface SelectionState {
  isSelectionMode: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
}

export interface VirtualGalleryHandle {
  scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' | 'auto' }) => void;
}

export interface VirtualGalleryProps<T extends { id: string }> {
  rows: GalleryRow<T>[];
  /** Cards per media row — must match the column count used to build `rows`. */
  columns?: number;
  /** Dense mode: gapless, edge-to-edge tiles. */
  dense?: boolean;
  renderCard: (item: T, context: CardContext) => ReactNode;
  selection?: SelectionState;
  toolbar?: ReactNode;
  onEndReached?: () => void;
  isFetchingMore?: boolean;
  /**
   * Called when scrolled near the top of the rendered range — fetching newer
   * content (fetchPreviousPage) after a jump into distant history. Rows
   * prepended in response keep their scroll position: the row anchored at
   * the top before the prepend is restored there after, so content already
   * in view does not visibly shift.
   */
  onStartReached?: () => void;
  isFetchingPrevious?: boolean;
  /** Called when the anchored visible row index changes — use to drive an external sidebar. */
  onFirstVisibleIndexChange?: (index: number) => void;
  /** Custom divider-row content — e.g. a date heading that doubles as a jump control. */
  renderDivider?: (date: Date) => ReactNode;
}

function VirtualGalleryInner<T extends { id: string }>(
  {
    rows,
    columns = 3,
    dense = false,
    renderCard,
    selection,
    toolbar,
    onEndReached,
    isFetchingMore,
    onStartReached,
    isFetchingPrevious,
    onFirstVisibleIndexChange,
    renderDivider,
  }: VirtualGalleryProps<T>,
  ref: React.ForwardedRef<VirtualGalleryHandle>,
) {
  const { hidden: panelChromeHidden } = usePanelScrollChromeState();

  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node ? resolveGalleryScrollOwner(node) : null);
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual exposes imperative functions that React Compiler intentionally leaves un-memoized.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (i) => {
      const row = rows[i];
      if (row?.type === 'divider') return DIVIDER_HEIGHT;
      return CARD_ROW_ESTIMATE;
    },
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 3,
  });

  React.useImperativeHandle(ref, () => ({
    // An imperative jump (e.g. the date menu) is not the user scrolling —
    // whichever direction it lands in must not flip the panel's search/date
    // chrome via the scroll-direction heuristic that real scrolling drives.
    // Isolate the resulting scroll event(s) until the position genuinely
    // settles: a jump can trigger react-virtual's own remeasurement, which
    // corrects scrollTop again a frame or two after the initial jump, so
    // lifting isolation after a single frame let that later correction
    // through and still flipped the chrome intermittently.
    scrollToIndex: (index, options) => {
      if (!scrollElement) {
        virtualizer.scrollToIndex(index, options);
        return;
      }
      scrollElement.setAttribute('data-scroll-direction-isolated', 'true');
      virtualizer.scrollToIndex(index, options);

      const SETTLE_FRAMES = 3;
      let lastTop = scrollElement.scrollTop;
      let stableFrames = 0;
      const checkSettled = () => {
        if (!scrollElement.isConnected) return;
        const currentTop = scrollElement.scrollTop;
        if (currentTop === lastTop) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
          lastTop = currentTop;
        }
        if (stableFrames >= SETTLE_FRAMES) {
          scrollElement.removeAttribute('data-scroll-direction-isolated');
          return;
        }
        requestAnimationFrame(checkSettled);
      };
      requestAnimationFrame(checkSettled);
    },
  }), [virtualizer, scrollElement]);

  // Map item id → global index for CardContext
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    rows.forEach((row) => {
      if (row.type === 'media') row.items.forEach((item) => map.set(item.id, idx++));
    });
    return map;
  }, [rows]);

  const totalItems = itemIndexMap.size;

  const virtualItems = virtualizer.getVirtualItems();
  const lastIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const firstIndex = virtualItems[0]?.index ?? -1;

  useEffect(() => {
    if (lastIndex >= rows.length - 3) onEndReached?.();
  }, [lastIndex, rows.length, onEndReached]);

  useEffect(() => {
    if (firstIndex >= 0 && firstIndex <= 2) onStartReached?.();
  }, [firstIndex, onStartReached]);

  // Rows prepended above the viewport (fetchPreviousPage resolving after a
  // jump) shift every existing row's index without moving the scrollport, so
  // the same scrollTop now shows different content. Track the row anchored
  // at the top by its stable key and, if a prepend moved it, snap back to it
  // before paint so nothing already in view visibly shifts.
  const previousAnchorRef = useRef<{ key: string; index: number } | null>(null);
  useLayoutEffect(() => {
    const previous = previousAnchorRef.current;
    let anchorIndex = virtualizer.getVirtualItems()[0]?.index ?? 0;
    if (previous) {
      const rowAtSamePosition = rows[previous.index];
      if (rowAtSamePosition?.key !== previous.key) {
        const newIndex = rows.findIndex((row) => row.key === previous.key);
        if (newIndex !== -1 && newIndex !== previous.index) {
          virtualizer.scrollToIndex(newIndex, { align: 'start' });
          anchorIndex = newIndex;
        }
      }
    }
    const topRow = rows[anchorIndex];
    previousAnchorRef.current = topRow ? { key: topRow.key, index: anchorIndex } : null;
  }, [rows, virtualizer]);

  // Scroll tracking — feeds onFirstVisibleIndexChange for external sidebars
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  useEffect(() => {
    if (!onFirstVisibleIndexChange || !scrollElement) return;
    setViewportHeight(scrollElement.clientHeight);
    const onScroll = () => {
      setScrollTop(scrollElement.scrollTop);
      setViewportHeight(scrollElement.clientHeight);
    };
    scrollElement.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', onScroll);
  }, [onFirstVisibleIndexChange, scrollElement]);

  const firstVisibleIndex = useMemo(
    () => getAnchoredVisibleRowIndex(virtualItems, scrollTop, viewportHeight),
    [virtualItems, scrollTop, viewportHeight],
  );

  useEffect(() => {
    onFirstVisibleIndexChange?.(firstVisibleIndex);
  }, [firstVisibleIndex, onFirstVisibleIndexChange]);

  const handleItemClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const itemId = e.currentTarget.getAttribute('data-item-id');
      if (itemId && selection?.isSelectionMode) selection.toggle(itemId);
    },
    [selection],
  );

  return (
    <div
      ref={containerRef}
      className={styles.container}
      data-dense={dense || undefined}
      style={{ '--gallery-cols': columns } as React.CSSProperties}
    >
      {toolbar && (
        <div
          className={styles.toolbar}
          data-hidden={(panelChromeHidden && !selection?.isSelectionMode) || undefined}
        >
          {toolbar}
        </div>
      )}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {isFetchingPrevious && (
          <div className={styles.loaderTop}>
            <Loader size="sm" />
          </div>
        )}
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{ position: 'absolute', top: virtualItem.start, left: 0, width: '100%' }}
            >
              {row.type === 'divider' ? (
                renderDivider ? renderDivider(row.date) : (
                  <div className={styles.divider}>
                    <span className={styles.dividerText}>
                      {formatCapturedAtDate(row.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )
              ) : (
                <div className={styles.mediaRow}>
                  {row.items.map((item) => {
                    const globalIndex = itemIndexMap.get(item.id) ?? 0;
                    const isSelected = selection?.isSelected(item.id) ?? false;
                    const showCheckbox = selection?.isSelectionMode ?? false;

                    return (
                      <div
                        key={item.id}
                        className={styles.cardWrapper}
                        data-item-id={item.id}
                        data-selectable={showCheckbox}
                        onClick={showCheckbox ? handleItemClick : undefined}
                      >
                        {renderCard(item, {
                          index: globalIndex,
                          isFirst: globalIndex === 0,
                          isLast: globalIndex === totalItems - 1,
                          isSelectionMode: showCheckbox,
                        })}
                        {showCheckbox && <SelectionCheckbox checked={isSelected} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isFetchingMore && (
        <div className={styles.loader}>
          <Loader size="sm" />
        </div>
      )}
    </div>
  );
}

export const VirtualGallery = React.forwardRef(VirtualGalleryInner) as <T extends { id: string }>(
  props: VirtualGalleryProps<T> & React.RefAttributes<VirtualGalleryHandle>
) => React.ReactElement | null;
