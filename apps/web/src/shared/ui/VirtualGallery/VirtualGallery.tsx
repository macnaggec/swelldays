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

type GalleryRowAnchor<_T extends { id: string }> =
  | { type: 'divider'; key: string; index: number; viewportOffset: number }
  | { type: 'media'; itemId: string; index: number; viewportOffset: number };

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
 * Records a row's freshly measured height and reports whether it differs from
 * the previously recorded height for that row index — the signal
 * scrollToIndex's settle check watches to keep a jump isolated while rows are
 * still correcting their estimated height (a row rendered for the first time
 * starts at CARD_ROW_ESTIMATE until measured, and its content — e.g. an image
 * finishing load — can change it again later), not just while scrollTop
 * itself is moving.
 */
export function recordRowMeasurement(
  measuredHeights: Map<number, number>,
  index: number,
  height: number,
): boolean {
  const previous = measuredHeights.get(index);
  measuredHeights.set(index, height);
  return previous !== undefined && previous !== height;
}

interface SelectionState {
  isSelectionMode: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
}

export interface VirtualGalleryHandle {
  scrollToIndex: (index: number, options?: { align: 'start' | 'center' | 'end' | 'auto' }) => void;
  /**
   * Focuses the given item's open control if its row is currently mounted in the
   * virtualized window; otherwise focuses the gallery's own scroll container so
   * focus never falls back to the document body. Returns whether the item's own
   * control received focus.
   */
  focusItem: (itemId: string) => boolean;
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

function firstVisibleRowIndex(
  virtualItems: MeasuredVirtualRow[],
  scrollTop: number,
  coveredTop: number,
): number {
  const visibleTop = scrollTop + coveredTop;
  return virtualItems.find((item) => item.start + item.size > visibleTop)?.index
    ?? virtualItems[0]?.index
    ?? 0;
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setScrollElement(node ? resolveGalleryScrollOwner(node) : null);
  }, []);
  // The scroll owner is PanelLayout's, shared across whichever section is
  // currently mounted (Feed, Gallery, ...) — it survives a section switch even
  // though this gallery itself is freshly mounted, so without this it silently
  // starts wherever the previous section left it scrolled.
  useLayoutEffect(() => {
    if (scrollElement) scrollElement.scrollTop = 0;
  }, [scrollElement]);
  const measuredRowHeightsRef = useRef<Map<number, number>>(new Map());
  const measurementEpochRef = useRef(0);
  const layoutAnchorIndexRef = useRef(0);
  const committedLayoutRef = useRef({ columns, dense });
  const layoutChanged = committedLayoutRef.current.columns !== columns
    || committedLayoutRef.current.dense !== dense;
  const correctionFrameRef = useRef<number | null>(null);
  const correctionScrollOwnerRef = useRef<HTMLElement | null>(null);
  const virtualCanvasRef = useRef<HTMLDivElement | null>(null);

  const isolateLayoutCorrection = useCallback(() => {
    if (!scrollElement) return;
    if (correctionFrameRef.current !== null) cancelAnimationFrame(correctionFrameRef.current);
    scrollElement.setAttribute('data-scroll-direction-isolated', 'gallery-layout');
    correctionScrollOwnerRef.current = scrollElement;
    correctionFrameRef.current = requestAnimationFrame(() => {
      correctionFrameRef.current = requestAnimationFrame(() => {
        if (scrollElement.getAttribute('data-scroll-direction-isolated') === 'gallery-layout') {
          scrollElement.removeAttribute('data-scroll-direction-isolated');
        }
        correctionFrameRef.current = null;
        correctionScrollOwnerRef.current = null;
      });
    });
  }, [scrollElement]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual exposes imperative functions that React Compiler intentionally leaves un-memoized.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: (i) => {
      const row = rows[i];
      if (row?.type === 'divider') return DIVIDER_HEIGHT;
      return CARD_ROW_ESTIMATE;
    },
    measureElement: (el) => {
      const height = (el as HTMLElement).offsetHeight;
      const indexAttr = el.getAttribute('data-index');
      if (indexAttr !== null && recordRowMeasurement(measuredRowHeightsRef.current, Number(indexAttr), height)) {
        measurementEpochRef.current += 1;
      }
      return height;
    },
    overscan: 3,
  });
  // TanStack's default also adjusts when the partially visible row itself changes
  // height, which preserves the content after it instead of that row's top edge.
  // Only accumulated size changes before the saved visible row move scrollTop.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) => {
    if (layoutChanged) return false;
    const shouldAdjust = item.index < layoutAnchorIndexRef.current;
    if (shouldAdjust) isolateLayoutCorrection();
    return shouldAdjust;
  };

  React.useImperativeHandle(ref, () => ({
    // An imperative jump (e.g. the date menu) is not the user scrolling —
    // whichever direction it lands in must not flip the panel's search/date
    // chrome via the scroll-direction heuristic that real scrolling drives.
    // Isolate the resulting scroll event(s) until the position AND every
    // row's measured height have genuinely settled: a jump can trigger
    // react-virtual's own remeasurement — a row rendered for the first time
    // starts at the estimated height until measured, and its content (e.g.
    // an image finishing load) can change it again later — and that
    // correction can land after scrollTop alone has already looked stable
    // for a few frames, letting it slip through unisolated and still flip
    // the chrome intermittently.
    scrollToIndex: (index, options) => {
      if (!scrollElement) {
        virtualizer.scrollToIndex(index, options);
        return;
      }
      scrollElement.setAttribute('data-scroll-direction-isolated', 'true');
      virtualizer.scrollToIndex(index, options);

      const SETTLE_FRAMES = 3;
      let lastTop = scrollElement.scrollTop;
      let lastMeasurementEpoch = measurementEpochRef.current;
      let stableFrames = 0;
      const checkSettled = () => {
        if (!scrollElement.isConnected) return;
        const currentTop = scrollElement.scrollTop;
        const currentMeasurementEpoch = measurementEpochRef.current;
        if (currentTop === lastTop && currentMeasurementEpoch === lastMeasurementEpoch) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
          lastTop = currentTop;
          lastMeasurementEpoch = currentMeasurementEpoch;
        }
        if (stableFrames >= SETTLE_FRAMES) {
          scrollElement.removeAttribute('data-scroll-direction-isolated');
          return;
        }
        requestAnimationFrame(checkSettled);
      };
      requestAnimationFrame(checkSettled);
    },
    focusItem: (itemId) => {
      const root = rootRef.current;
      if (!root) return false;
      const control = root.querySelector<HTMLElement>(`[data-item-id="${itemId}"] [data-media-card-open]`);
      if (control) {
        control.focus();
        return true;
      }
      root.focus();
      return false;
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
  const previousAnchorRef = useRef<GalleryRowAnchor<T> | null>(null);

  const captureAnchor = useCallback(() => {
    const virtualRows = virtualizer.getVirtualItems();
    const scrollTop = scrollElement?.scrollTop ?? 0;
    const coveredTop = Number(scrollElement?.dataset.panelChromeHeight ?? '0');
    const scrollViewportTop = scrollElement?.getBoundingClientRect().top;
    const canvasViewportTop = virtualCanvasRef.current?.getBoundingClientRect().top;
    const visibleCanvasOffset = scrollViewportTop !== undefined && canvasViewportTop !== undefined
      ? scrollViewportTop + coveredTop - canvasViewportTop
      : scrollTop + coveredTop;
    const anchorRow = virtualRows.find((row) => row.start + row.size > visibleCanvasOffset);
    const anchorIndex = anchorRow?.index ?? virtualRows[0]?.index ?? 0;
    const viewportOffset = anchorRow
      ? scrollViewportTop !== undefined && canvasViewportTop !== undefined
        ? canvasViewportTop + anchorRow.start - scrollViewportTop
        : anchorRow.start - scrollTop
      : undefined;
    layoutAnchorIndexRef.current = anchorIndex;
    const row = rows[anchorIndex];
    if (!row) {
      previousAnchorRef.current = null;
      return;
    }
    previousAnchorRef.current = row.type === 'divider'
      ? { type: 'divider', key: row.key, index: anchorIndex, viewportOffset: viewportOffset ?? coveredTop }
      : { type: 'media', itemId: row.items[0]!.id, index: anchorIndex, viewportOffset: viewportOffset ?? coveredTop };
  }, [rows, scrollElement, virtualizer]);

  const captureAnchorRef = useRef(captureAnchor);
  useLayoutEffect(() => {
    captureAnchorRef.current = captureAnchor;
  }, [captureAnchor]);

  useEffect(() => {
    if (!scrollElement) return;
    captureAnchorRef.current();
    const handleScroll = () => {
      if (!scrollElement.hasAttribute('data-scroll-direction-isolated')) {
        captureAnchorRef.current();
      }
    };
    scrollElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [scrollElement]);

  useEffect(() => () => {
    if (correctionFrameRef.current !== null) cancelAnimationFrame(correctionFrameRef.current);
    const correctionScrollOwner = correctionScrollOwnerRef.current;
    if (correctionScrollOwner?.getAttribute('data-scroll-direction-isolated') === 'gallery-layout') {
      correctionScrollOwner.removeAttribute('data-scroll-direction-isolated');
    }
  }, []);

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
  // before paint so nothing already in view visibly shifts. The anchor is
  // tracked by the item at the row's head, not the row's own key, so a
  // chunk-boundary shift from a recolumn (a manual panel toggle or a
  // capability-band crossing changing the column count) is followed
  // correctly even when the anchored row is not a group's first chunk.
  useLayoutEffect(() => {
    const previous = previousAnchorRef.current;
    const virtualRows = virtualizer.getVirtualItems();
    const scrollTop = scrollElement?.scrollTop ?? 0;
    const coveredTop = Number(scrollElement?.dataset.panelChromeHeight ?? '0');
    let anchorIndex = firstVisibleRowIndex(virtualRows, scrollTop, coveredTop);
    // The canvas sits this far below the scroll owner's own top edge right now —
    // at rest that gap is exactly the pinned chrome's reserved height. Reused
    // below for both the recolumn correction and the anchor capture so a row's
    // viewport-relative position is computed the same way in both places; a
    // capture that ignored this gap would read the anchor as chrome-heights
    // closer to the top than the correction later assumes, and the correction
    // would "fix" that phantom gap by introducing a real one.
    const canvasViewportOffset = virtualCanvasRef.current && scrollElement
      ? virtualCanvasRef.current.getBoundingClientRect().top
        - scrollElement.getBoundingClientRect().top
      : -scrollTop;

    if (previous) {
      const matchesAnchor = (row: GalleryRow<T> | undefined): boolean => {
        if (!row) return false;
        return previous.type === 'divider'
          ? row.type === 'divider' && row.key === previous.key
          : row.type === 'media' && row.items.some((item) => item.id === previous.itemId);
      };

      if (matchesAnchor(rows[previous.index])) {
        anchorIndex = previous.index;
      } else {
        const newIndex = rows.findIndex(matchesAnchor);
        if (newIndex !== -1 && newIndex !== previous.index) {
          anchorIndex = newIndex;
          if (!layoutChanged) virtualizer.scrollToIndex(newIndex, { align: 'start' });
        }
      }
    }

    layoutAnchorIndexRef.current = anchorIndex;

    if (layoutChanged) {
      const renderedRows = rootRef.current?.querySelectorAll<HTMLElement>('[data-virtual-gallery-row]');
      let mediaRowHeight: number | null = null;
      let dividerRowHeight: number | null = null;

      renderedRows?.forEach((rowElement) => {
        const index = Number(rowElement.dataset.index);
        const row = rows[index];
        if (row?.type === 'media' && mediaRowHeight === null) mediaRowHeight = rowElement.offsetHeight;
        if (row?.type === 'divider' && dividerRowHeight === null) dividerRowHeight = rowElement.offsetHeight;
      });

      rows.forEach((row, index) => {
        virtualizer.resizeItem(
          index,
          row.type === 'divider'
            ? dividerRowHeight ?? DIVIDER_HEIGHT
            : mediaRowHeight ?? CARD_ROW_ESTIMATE,
        );
      });

      const totalSize = virtualizer.getTotalSize();
      if (virtualCanvasRef.current) virtualCanvasRef.current.style.height = `${totalSize}px`;

      if (previous && scrollElement) {
        const anchorOffset = virtualizer.getOffsetForIndex(anchorIndex, 'start')?.[0];
        if (anchorOffset !== undefined) {
          const currentAnchorViewportOffset = canvasViewportOffset + anchorOffset;
          isolateLayoutCorrection();
          virtualizer.scrollToOffset(
            Math.max(
              0,
              scrollElement.scrollTop + currentAnchorViewportOffset - previous.viewportOffset,
            ),
            { align: 'start' },
          );
        }
      }
    }

    committedLayoutRef.current = { columns, dense };
    // The very first capture (no previous anchor to preserve) needs a real
    // canvasViewportOffset to be worth locking in — otherwise it captures a
    // viewport offset that's short by the reserved chrome height, and every
    // later recolumn's correction trusts that wrong baseline as the anchor's
    // true rest position instead of retrying once real geometry exists.
    const hasRealGeometry = Boolean(virtualCanvasRef.current && scrollElement);
    if (previous || hasRealGeometry) {
      const topRow = rows[anchorIndex];
      const currentAnchorRow = virtualRows.find((row) => row.index === anchorIndex);
      const currentViewportOffset = currentAnchorRow
        ? canvasViewportOffset + currentAnchorRow.start
        : undefined;
      const viewportOffset = previous?.viewportOffset ?? currentViewportOffset ?? coveredTop;
      previousAnchorRef.current = topRow
        ? topRow.type === 'divider'
          ? { type: 'divider', key: topRow.key, index: anchorIndex, viewportOffset }
          : {
            type: 'media',
            itemId: previous?.type === 'media'
              && topRow.items.some((item) => item.id === previous.itemId)
              ? previous.itemId
              : topRow.items[0]!.id,
            index: anchorIndex,
            viewportOffset,
          }
        : null;
    }
  }, [rows, columns, dense, layoutChanged, scrollElement, virtualizer, isolateLayoutCorrection]);

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
      data-panel-collection-grid
      data-columns={columns}
      tabIndex={-1}
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
      <div
        ref={virtualCanvasRef}
        data-virtual-gallery-canvas
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
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
              data-virtual-gallery-row
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
                <div
                  className={styles.mediaRow}
                  data-section-start={rows[virtualItem.index - 1]?.type === 'divider' || undefined}
                  data-section-end={rows[virtualItem.index + 1]?.type !== 'media' || undefined}
                >
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
