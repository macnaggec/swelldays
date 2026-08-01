import { Children, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { useMergedRef } from '@mantine/hooks';
import { galleryColumns } from 'shared/lib/galleryColumns';
import { useMeasuredWidth } from 'shared/hooks/useMeasuredWidth';
import { useSettledLayout } from 'shared/ui/DrawerShell/panelSettledWidth';
import styles from './PanelCollectionGrid.module.css';

const PanelCollectionColumnsContext = createContext(1);

/**
 * The column count the grid is currently rendering, for children that must react to a
 * re-column rather than just be re-positioned by it.
 *
 * A card that animates between its old and new slot has to re-render when the count
 * changes: the animation is driven by the card measuring itself before and after, and
 * a card whose own output did not change is skipped by React and never measures. The
 * count changes inside the grid, so without this the cards below it never hear about
 * it and jump straight to their new places.
 */
export function usePanelCollectionColumns(): number {
  return useContext(PanelCollectionColumnsContext);
}

interface PanelCollectionGridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Trim the grid to three rows' worth of children. Used by loading skeletons so a
   * placeholder fills the same visual block at any column count.
   */
  preview?: boolean;
}

export function PanelCollectionGrid({
  className,
  preview = false,
  style,
  children,
  ...props
}: PanelCollectionGridProps) {
  // PanelLayout already holds the whole panel at its destination width for the open and
  // close, so the grid's box is right from the first frame. Its *measurement* of that
  // box is not: a resize measurement lands a frame later, and for that one frame the
  // grid would still be arranged in one column while already occupying the full width —
  // long enough to see a single card stretched across the panel. So the destination is
  // taken directly, and measurement is only the source once standing still.
  const [measuredWidth, measureRef] = useMeasuredWidth();
  const { contentWidth } = useSettledLayout(measuredWidth);

  // Arranged for where it will settle, from the first frame of the toggle. A resize
  // measurement lands a frame later, and for that frame the grid would still be
  // arranged for the width it just left — long enough to see one card stretched across
  // the panel when opening, or three squeezed into a narrow one when closing.
  const columns = galleryColumns(contentWidth ?? measuredWidth, 'panelCard');

  // No width of its own: PanelLayout gives the card area the destination width, so the
  // grid fills it and the cards are placed relative to the panel — the top card already
  // in its final spot and staying there, the one beside it dropping to the row below,
  // the panel carrying them as it slides. Only the column count has to come from the
  // destination directly, because a measurement of the new width lands a frame late.
  const renderedChildren = preview
    ? Children.toArray(children).slice(0, columns * 3)
    : children;

  const gridNodeRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useMergedRef(measureRef, gridNodeRef);
  const anchorRef = useRef<{ node: Element; offsetFromScrollOwnerTop: number } | null>(null);

  const captureAnchor = useCallback(() => {
    const grid = gridNodeRef.current;
    const scrollOwner = grid?.closest<HTMLElement>('[data-panel-scroll-owner]');
    if (!grid || !scrollOwner) return;
    const scrollOwnerTop = scrollOwner.getBoundingClientRect().top;
    const cards = Array.from(grid.children);
    const anchor = cards.find((card) => card.getBoundingClientRect().bottom > scrollOwnerTop) ?? cards[0];
    anchorRef.current = anchor
      ? { node: anchor, offsetFromScrollOwnerTop: anchor.getBoundingClientRect().top - scrollOwnerTop }
      : null;
  }, []);

  // The anchor must reflect wherever the photographer has actually scrolled to, which
  // can change with no render at all — the recolumn correction below is only as good as
  // knowing where they really are the instant it runs.
  useEffect(() => {
    const scrollOwner = gridNodeRef.current?.closest<HTMLElement>('[data-panel-scroll-owner]');
    if (!scrollOwner) return;
    captureAnchor();
    scrollOwner.addEventListener('scroll', captureAnchor, { passive: true });
    return () => scrollOwner.removeEventListener('scroll', captureAnchor);
  }, [captureAnchor]);

  // A recolumn changes row heights (fewer columns means more, taller rows) without
  // moving scrollTop, so a scroll position that used to show one card can land on a
  // completely different one once scrolled past the first row. `overflow-anchor` is
  // disabled on this grid's scroll owner for an unrelated chrome-direction reason
  // (PanelLayout.module.css), so nothing else compensates.
  useLayoutEffect(() => {
    const grid = gridNodeRef.current;
    const scrollOwner = grid?.closest<HTMLElement>('[data-panel-scroll-owner]');
    const anchor = anchorRef.current;
    if (!grid || !scrollOwner || !anchor || !anchor.node.isConnected) return;

    const newOffset = anchor.node.getBoundingClientRect().top - scrollOwner.getBoundingClientRect().top;
    const delta = newOffset - anchor.offsetFromScrollOwnerTop;
    if (delta !== 0) scrollOwner.scrollTop += delta;
    captureAnchor();
  }, [columns, captureAnchor]);

  return (
    <div
      {...props}
      ref={gridRef}
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-panel-collection-grid
      data-preview={preview || undefined}
      data-columns={columns}
      style={{
        ...style,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      <PanelCollectionColumnsContext.Provider value={columns}>
        {renderedChildren}
      </PanelCollectionColumnsContext.Provider>
    </div>
  );
}
