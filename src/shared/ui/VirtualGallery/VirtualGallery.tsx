import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual';
import { Loader } from '@mantine/core';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import type { CardContext } from 'shared/ui/BaseGallery/BaseGallery';
import SelectionCheckbox from 'shared/ui/BaseGallery/SelectionCheckbox';
import { PanelScrollChrome, usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
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

/**
 * The divider row that should stick to the top of the scrollport: the last
 * divider at or above the first rendered row. -1 when the range is still above
 * the first divider (or there are none).
 */
export function getActiveStickyIndex(dividerIndexes: number[], rangeStartIndex: number): number {
  let active = -1;
  for (const index of dividerIndexes) {
    if (index <= rangeStartIndex) active = index;
    else break;
  }
  return active;
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
  /** Called when the anchored visible row index changes — use to drive an external sidebar. */
  onFirstVisibleIndexChange?: (index: number) => void;
  /**
   * Pin the current section's divider row to the top of the scrollport while
   * its rows scroll beneath — the below-rail-capability date navigation (F12g).
   */
  stickyDividers?: boolean;
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
    onFirstVisibleIndexChange,
    stickyDividers = false,
    renderDivider,
  }: VirtualGalleryProps<T>,
  ref: React.ForwardedRef<VirtualGalleryHandle>,
) {
  const { hidden: panelChromeHidden } = usePanelScrollChromeState();

  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node ? resolveGalleryScrollOwner(node) : null);
  }, []);

  // Sticky dividers: the active section's divider is kept in the rendered
  // range so it can pin to the scrollport top while its rows pass beneath.
  const dividerIndexes = useMemo(
    () => rows.flatMap((row, i) => (row.type === 'divider' ? [i] : [])),
    [rows],
  );
  const activeStickyIndexRef = useRef(-1);
  const rangeExtractor = useCallback((range: Range) => {
    if (!stickyDividers || dividerIndexes.length === 0) {
      activeStickyIndexRef.current = -1;
      return defaultRangeExtractor(range);
    }
    const active = getActiveStickyIndex(dividerIndexes, range.startIndex);
    activeStickyIndexRef.current = active;
    if (active < 0) return defaultRangeExtractor(range);
    const withSticky = new Set([active, ...defaultRangeExtractor(range)]);
    return [...withSticky].sort((a, b) => a - b);
  }, [stickyDividers, dividerIndexes]);

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
    rangeExtractor,
  });

  React.useImperativeHandle(ref, () => ({
    scrollToIndex: (index, options) => virtualizer.scrollToIndex(index, options),
  }), [virtualizer]);

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

  useEffect(() => {
    if (lastIndex >= rows.length - 3) onEndReached?.();
  }, [lastIndex, rows.length, onEndReached]);

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
      <PanelScrollChrome />
      {toolbar && (
        <div
          className={styles.toolbar}
          data-hidden={(panelChromeHidden && !selection?.isSelectionMode) || undefined}
        >
          {toolbar}
        </div>
      )}
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualItems.map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;

          // The active sticky divider stays in flow at the container top with
          // position: sticky, so it pins to the scrollport while every other
          // row keeps the virtualizer's absolute placement.
          const isActiveSticky = stickyDividers && virtualItem.index === activeStickyIndexRef.current;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className={isActiveSticky ? styles.stickyRow : undefined}
              style={isActiveSticky
                ? undefined
                : { position: 'absolute', top: virtualItem.start, left: 0, width: '100%' }}
            >
              {row.type === 'divider' ? (
                renderDivider ? renderDivider(row.date) : (
                  <div className={styles.divider}>
                    <span className={styles.dividerText}>
                      {row.date.toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
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
