import { Children, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { useMergedRef } from '@mantine/hooks';
import { galleryColumns } from 'shared/lib/galleryColumns';
import { useMeasuredWidth } from 'shared/hooks/useMeasuredWidth';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import {
  usePanelSettledWidth,
  useSettledLayout,
} from 'shared/ui/DrawerShell/panelSettledWidth';
import styles from './PanelCollectionGrid.module.css';
import {
  beginPanelCollectionScrollCorrection,
  endPanelCollectionScrollCorrection,
  isPanelCollectionScrollCorrection,
  settlePanelCollectionScrollCorrection,
} from './scrollCorrection';

const SITE_WORKSPACE_COLLECTION_MAX_COLUMNS = 2;
const PanelCollectionColumnsContext = createContext(1);
const SCROLL_RUNWAY_PROPERTY = '--wa-panel-collection-scroll-runway';
const SCROLL_HEAD_RUNWAY_PROPERTY = '--wa-panel-collection-scroll-head-runway';

interface PanelCollectionAnchor {
  node: Element;
  contentTop: number;
  offsetFromScrollOwnerTop: number;
}

interface PendingScrollIsolation {
  frame: number;
  scrollOwner: HTMLElement;
}

/**
 * `element`'s layout position relative to `scrollOwner`'s content, ignoring any CSS
 * `transform` between them.
 *
 * Cards glide between grid cells via a `transform` (FeedCardSlot's framer-motion
 * `layout` prop), and `getBoundingClientRect` reports the *painted* box — mid-glide,
 * that is wherever the animation currently is, not the card's real slot. Reading a
 * card's position while a previous glide is still settling — which the scroll
 * listener below can do, since the correction's own `scrollTop` write fires a real
 * `scroll` event — used to record that in-flight position as the card's true one, and
 * the next recolumn then corrected against a card that was never actually there.
 * `offsetTop`/`offsetParent` describe the box's own layout position and do not move
 * with a `transform`, so this reads the same whether a glide is running or not.
 */
function contentTop(element: Element, scrollOwner: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = element as HTMLElement;
  while (node && node !== scrollOwner) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return top;
}

function layoutContentBottom(scrollOwner: HTMLElement): number {
  return Array.from(scrollOwner.children).reduce((bottom, child) => {
    const element = child as HTMLElement;
    return Math.max(bottom, contentTop(element, scrollOwner) + element.offsetHeight);
  }, scrollOwner.clientHeight);
}

/**
 * How much of the scroll owner's own top edge PanelLayout's pinned search/filter row
 * currently covers — 0 if there is none, or if it is hidden (slid away on scroll-down).
 * PanelLayout publishes this itself, as `data-panel-chrome-height` on the scroll owner:
 * that row sits in normal flow ahead of the grid (so it does not shift any card's own
 * layout position), then pins visually over whatever content scrolls beneath it. A card
 * whose content position crosses the scroll owner's raw `scrollTop` can still be
 * entirely covered by this row — visible to the DOM, not to the photographer — so
 * picking an anchor by raw `scrollTop` alone could anchor a card they cannot actually
 * see, and the card they *can* see would then land wherever this row's own height
 * happens to put it, one drawer generation to the next.
 */
function visibleChromeHeight(scrollOwner: HTMLElement): number {
  return Number(scrollOwner.dataset.panelChromeHeight ?? '0');
}

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
  const panelSettledWidth = usePanelSettledWidth();
  const { contentWidth } = useSettledLayout(measuredWidth);
  const arrangementWidth = contentWidth ?? measuredWidth;
  const suspendAnchorCapture = panelSettledWidth !== null
    && !panelSettledWidth.open;

  // Arranged for where it will settle, from the first frame of the toggle. A resize
  // measurement lands a frame later, and for that frame the grid would still be
  // arranged for the width it just left — long enough to see one card stretched across
  // the panel when opening, or three squeezed into a narrow one when closing.
  const layoutPolicy = useAppShellLayoutPolicy();
  const maxColumnsOverride = layoutPolicy.drawer.presentation === 'sideWorkspace'
    ? SITE_WORKSPACE_COLLECTION_MAX_COLUMNS
    : undefined;
  const columns = galleryColumns(arrangementWidth, 'panelCard', maxColumnsOverride);

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
  const anchorRef = useRef<PanelCollectionAnchor | null>(null);
  const anchorCaptureSuspendedRef = useRef(false);

  const captureAnchor = useCallback(() => {
    const grid = gridNodeRef.current;
    const scrollOwner = grid?.closest<HTMLElement>('[data-panel-scroll-owner]');
    if (!grid || !scrollOwner) return;
    const chromeHeight = visibleChromeHeight(scrollOwner);
    const visibleTop = scrollOwner.scrollTop + chromeHeight;
    const cards = Array.from(grid.children);
    const anchor = cards.find(
      (card) => contentTop(card, scrollOwner) + (card as HTMLElement).offsetHeight > visibleTop,
    ) ?? cards[0];
    if (!anchor) {
      anchorRef.current = null;
      return;
    }

    const anchorContentTop = contentTop(anchor, scrollOwner);
    anchorRef.current = {
      node: anchor,
      contentTop: anchorContentTop,
      offsetFromScrollOwnerTop: anchorContentTop - scrollOwner.scrollTop,
    };
  }, []);

  // The anchor must reflect wherever the photographer has actually scrolled to, which
  // can change with no render at all — the recolumn correction below is only as good as
  // knowing where they really are the instant it runs.
  useEffect(() => {
    const scrollOwner = gridNodeRef.current?.closest<HTMLElement>('[data-panel-scroll-owner]');
    if (!scrollOwner) return;
    if (!anchorCaptureSuspendedRef.current) captureAnchor();
    const handleScroll = () => {
      if (!anchorCaptureSuspendedRef.current
        && !isPanelCollectionScrollCorrection(scrollOwner)) {
        endPanelCollectionScrollCorrection(scrollOwner);
        captureAnchor();
      }
    };
    scrollOwner.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollOwner.removeEventListener('scroll', handleScroll);
  }, [captureAnchor]);

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
        <PanelCollectionAnchorCorrection
          columns={columns}
          arrangementWidth={arrangementWidth}
          suspendAnchorCapture={suspendAnchorCapture}
          layoutDependency={renderedChildren}
          gridNodeRef={gridNodeRef}
          anchorRef={anchorRef}
          anchorCaptureSuspendedRef={anchorCaptureSuspendedRef}
          captureAnchor={captureAnchor}
        />
        {renderedChildren}
      </PanelCollectionColumnsContext.Provider>
    </div>
  );
}

interface PanelCollectionAnchorCorrectionProps {
  columns: number;
  arrangementWidth: number;
  suspendAnchorCapture: boolean;
  layoutDependency: ReactNode;
  gridNodeRef: RefObject<HTMLDivElement | null>;
  anchorRef: RefObject<PanelCollectionAnchor | null>;
  anchorCaptureSuspendedRef: RefObject<boolean>;
  captureAnchor: () => void;
}

function PanelCollectionAnchorCorrection({
  columns,
  arrangementWidth,
  suspendAnchorCapture,
  layoutDependency,
  gridNodeRef,
  anchorRef,
  anchorCaptureSuspendedRef,
  captureAnchor,
}: PanelCollectionAnchorCorrectionProps) {
  const pendingIsolationRef = useRef<PendingScrollIsolation | null>(null);
  const hasEstablishedArrangementRef = useRef(false);
  const previousArrangementWidthRef = useRef<number | null>(null);

  useEffect(() => () => {
    const pending = pendingIsolationRef.current;
    if (!pending) return;
    cancelAnimationFrame(pending.frame);
    endPanelCollectionScrollCorrection(pending.scrollOwner);
    pendingIsolationRef.current = null;
  }, []);

  // A resize or recolumn changes row heights without moving scrollTop. Run after every host
  // mutation, including the pinned toolbar's new height, but before the card siblings'
  // framer-motion layout effects measure their glide. A parent layout effect would run
  // after those children; an insertion effect runs too early, before ancestor host
  // updates, and can accumulate their stale offset across repeated toggles.
  useLayoutEffect(() => {
    const grid = gridNodeRef.current;
    const scrollOwner = grid?.closest<HTMLElement>('[data-panel-scroll-owner]');
    const anchor = anchorRef.current;
    if (!grid || !scrollOwner) return;

    const previousIsolation = pendingIsolationRef.current;
    if (suspendAnchorCapture || arrangementWidth <= 0) {
      anchorCaptureSuspendedRef.current = true;
      if (previousIsolation) {
        cancelAnimationFrame(previousIsolation.frame);
        endPanelCollectionScrollCorrection(previousIsolation.scrollOwner);
        pendingIsolationRef.current = null;
      }
      return;
    }

    const wasAnchorCaptureSuspended = anchorCaptureSuspendedRef.current;
    anchorCaptureSuspendedRef.current = false;
    if (!hasEstablishedArrangementRef.current) {
      hasEstablishedArrangementRef.current = true;
      previousArrangementWidthRef.current = arrangementWidth;
      // scrollOwner is PanelLayout's, shared across whichever section is
      // currently mounted (Feed, Gallery, ...) — it survives a section switch
      // even though this grid itself is freshly mounted, so without this it
      // silently starts wherever the previous section left it scrolled.
      scrollOwner.scrollTop = 0;
      captureAnchor();
      return;
    }

    const arrangementWidthChanged = previousArrangementWidthRef.current !== arrangementWidth;
    previousArrangementWidthRef.current = arrangementWidth;
    const hasActiveRunway = grid.style.getPropertyValue(SCROLL_RUNWAY_PROPERTY) !== ''
      || grid.style.getPropertyValue(SCROLL_HEAD_RUNWAY_PROPERTY) !== '';
    const anchorLayoutChanged = Boolean(
      anchor?.node.isConnected
      && contentTop(anchor.node, scrollOwner) !== anchor.contentTop,
    );
    const needsIsolation = anchorLayoutChanged
      || hasActiveRunway
      || wasAnchorCaptureSuspended
      || arrangementWidthChanged;
    const needsScrollMutation = anchorLayoutChanged
      || hasActiveRunway
      || wasAnchorCaptureSuspended;
    let pendingIsolation: PendingScrollIsolation | null = null;

    // A render can arrive after Mobile Safari momentum has already advanced the
    // native scroll position. If the cards themselves did not move, replaying the
    // previously captured absolute anchor would drag the list back toward that older
    // position. Refresh the anchor from the browser's current position instead; only
    // a real layout shift or an active correction runway may write scrollTop.
    if (!needsIsolation) {
      if (!previousIsolation) captureAnchor();
      return;
    }

    if (previousIsolation) {
      cancelAnimationFrame(previousIsolation.frame);
      if (!needsIsolation || previousIsolation.scrollOwner !== scrollOwner) {
        endPanelCollectionScrollCorrection(previousIsolation.scrollOwner);
      }
      pendingIsolationRef.current = null;
    }

    if (needsIsolation) {
      beginPanelCollectionScrollCorrection(scrollOwner);
      pendingIsolation = {
        frame: 0,
        scrollOwner,
      };
      pendingIsolationRef.current = pendingIsolation;

      pendingIsolation.frame = requestAnimationFrame(() => {
        if (!pendingIsolation) return;
        pendingIsolation.frame = requestAnimationFrame(() => {
          if (!pendingIsolation || pendingIsolationRef.current !== pendingIsolation) return;
          endPanelCollectionScrollCorrection(scrollOwner);
          pendingIsolationRef.current = null;
          captureAnchor();
        });
      });
    }

    grid.style.removeProperty(SCROLL_RUNWAY_PROPERTY);
    grid.style.removeProperty(SCROLL_HEAD_RUNWAY_PROPERTY);
    if (!needsScrollMutation) {
      if (pendingIsolation) settlePanelCollectionScrollCorrection(scrollOwner);
      return;
    }
    if (!anchor || !anchor.node.isConnected) {
      if (pendingIsolation) settlePanelCollectionScrollCorrection(scrollOwner);
      if (!pendingIsolation) captureAnchor();
      return;
    }

    let desiredScrollTop = contentTop(anchor.node, scrollOwner)
      - anchor.offsetFromScrollOwnerTop;
    if (desiredScrollTop < 0) {
      grid.style.setProperty(SCROLL_HEAD_RUNWAY_PROPERTY, `${-desiredScrollTop}px`);
      desiredScrollTop = contentTop(anchor.node, scrollOwner)
        - anchor.offsetFromScrollOwnerTop;
    }

    const gridBottom = contentTop(grid, scrollOwner) + grid.offsetHeight;
    const requiredContentBottom = desiredScrollTop + scrollOwner.clientHeight;
    let runway = layoutContentBottom(scrollOwner) < requiredContentBottom
      ? Math.ceil(requiredContentBottom - gridBottom)
      : 0;
    if (runway > 0) {
      grid.style.setProperty(SCROLL_RUNWAY_PROPERTY, `${runway}px`);
    }
    scrollOwner.scrollTop = desiredScrollTop;

    const residualClamp = desiredScrollTop - scrollOwner.scrollTop;
    if (residualClamp > 0) {
      runway += Math.ceil(residualClamp);
      grid.style.setProperty(SCROLL_RUNWAY_PROPERTY, `${runway}px`);
      scrollOwner.scrollTop = desiredScrollTop;
    }
    if (pendingIsolation) settlePanelCollectionScrollCorrection(scrollOwner);
  }, [
    columns,
    arrangementWidth,
    suspendAnchorCapture,
    layoutDependency,
    gridNodeRef,
    anchorRef,
    anchorCaptureSuspendedRef,
    captureAnchor,
  ]);

  return null;
}
