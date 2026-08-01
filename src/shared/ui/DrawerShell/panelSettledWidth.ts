import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react';
import { getDrawerGeometrySnapshot, subscribeDrawerGeometry } from './geometry';

export interface PanelSettledWidth {
  /**
   * Width in px the drawer surface will settle at. Known the instant the toggle is
   * pressed, before the surface has moved. 0 until the surface has been measured once.
   */
  destinationWidth: number;
  /** True while the surface is animating toward that width. */
  transitioning: boolean;
}

/**
 * Lets panel content lay itself out at the width the drawer is heading for instead of
 * the width it currently has.
 *
 * The surface's own width is animated frame by frame (the globe's camera occlusion
 * reads its real border-box), so content that sizes itself from the live box is
 * re-laid-out every frame — which is what walks the card grid through every
 * intermediate column count during a toggle. Content that consumes this sizes itself
 * once, to the destination, and the moving surface edge sweeps across it.
 *
 * Deliberately the *surface's* width rather than each consumer's own: the surface is a
 * clean multiple of itself between states (25vw → 75vw, exactly ×3), while a consumer's
 * width is that minus padding that does not scale with it. A consumer scaling its own
 * measurement by 3 overshoots by twice its inset — enough to pick the wrong column count
 * near a boundary, animate to it, and then visibly correct. Consumers subtract their own
 * inset from this instead, which they can measure exactly while at rest.
 *
 * Null outside a DrawerShell (e.g. the upload modal), where there is no toggle and
 * measured width is already the settled width.
 */
export const PanelSettledWidthContext = createContext<PanelSettledWidth | null>(null);

export function usePanelSettledWidth(): PanelSettledWidth | null {
  return useContext(PanelSettledWidthContext);
}

export interface SettledLayout {
  /**
   * Width to *occupy* while the drawer moves — the wider of where it is and where it is
   * going — or null when it is standing still. Taking the narrower of the two would clip
   * the cards that are still travelling across the space it gave up.
   */
  boxWidth: number | null;
  /**
   * Width to *arrange for*: where it will settle. Known from the first frame of the
   * change and never stale, unlike a measurement, which lands a frame late and would
   * leave the element arranged for the width it just left.
   */
  contentWidth: number | null;
  /** True while the drawer is moving between its two states. */
  transitioning: boolean;
}

/**
 * Applies the panel's width *right now*, mid-animation, minus this element's own inset,
 * to `elementRef`'s DOM node as a `transform: scale(...)` relative to `scaleBasisWidth`
 * — or clears it, when the panel is standing still.
 *
 * The opposite choice from `useSettledLayout`, and right for the opposite case. Content
 * whose arrangement changes between the two panel states must not follow the moving
 * width, or it re-flows on every frame. Content that keeps the same arrangement and only
 * changes *size* — the photo grid, which holds its column count and simply scales its
 * tiles — has nothing to re-flow, so following the width is what makes it grow and
 * shrink with the panel instead of jumping to its final size and waiting to be uncovered.
 *
 * A CSS transform rather than `width`: `elementRef` is expected to hold dozens of mounted
 * cards, and animating `width` forces the browser to re-run layout for that whole subtree
 * on every frame, competing with the animation itself for the frame budget. `transform`
 * is compositor-only — it never triggers layout or paint — so `elementRef` should be laid
 * out once at `scaleBasisWidth` (its caller's own settled `contentWidth`) and left there;
 * this only ever touches its rendered scale.
 *
 * Written to the DOM directly rather than returned as a value, for the same reason:
 * `elementRef`'s caller would otherwise re-render on every one of geometry's per-frame
 * publishes just to pass a new scale prop through. Callers of `useSettledLayout` are
 * unaffected either way; that hook already only changes at rest, not per frame.
 */
export function useLivePanelScaleOnElement(
  measuredWidth: number,
  scaleBasisWidth: number,
  elementRef: RefObject<HTMLElement | null>,
): void {
  const settled = usePanelSettledWidth();
  const transitioning = settled?.transitioning ?? false;
  const destinationSurface = settled?.destinationWidth ?? 0;

  const [inset, setInset] = useState(-1);
  if (!transitioning && measuredWidth > 0 && destinationSurface > 0) {
    const next = destinationSurface - measuredWidth;
    if (next !== inset) setInset(next);
  }

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const applyScale = () => {
      if (!transitioning || inset < 0 || scaleBasisWidth <= 0) {
        element.style.transform = '';
        return;
      }
      const geometry = getDrawerGeometrySnapshot();
      if (!geometry) return;
      const liveContentWidth = Math.max(0, geometry.width - inset);
      element.style.transform = `scale(${liveContentWidth / scaleBasisWidth})`;
    };

    applyScale();
    const unsubscribe = subscribeDrawerGeometry(applyScale);
    return () => { unsubscribe(); };
  }, [elementRef, transitioning, inset, scaleBasisWidth]);
}

/**
 * Splits the two widths an element needs during a drawer toggle, which are the same at
 * rest and differ while it moves.
 *
 * Opening, the two agree: the destination is also the wider, so content is arranged for
 * its final width up front and the widening surface simply uncovers it.
 *
 * Closing, they differ, and that is the whole point. Content arranged for the narrow
 * destination inside a box that is still wide keeps every card visible while it travels
 * to its new place; content given the narrow box as well would have the cards that no
 * longer fit clipped away, so they appear to slide in from behind an invisible edge.
 *
 * Takes the caller's own measured width to work out how much narrower than the surface
 * it sits — padding, and anything beside it such as the gallery's date rail. That gap
 * does not scale when the panel does, so it is captured while standing still and
 * subtracted, rather than scaling the caller's own width, which would overshoot by twice
 * the gap.
 */
export function useSettledLayout(measuredWidth: number): SettledLayout {
  const settled = usePanelSettledWidth();
  const transitioning = settled?.transitioning ?? false;
  const destinationSurface = settled?.destinationWidth ?? 0;

  const [rest, setRest] = useState({ inset: -1, width: 0 });
  if (!transitioning && measuredWidth > 0 && destinationSurface > 0) {
    const inset = destinationSurface - measuredWidth;
    if (rest.inset !== inset || rest.width !== measuredWidth) {
      setRest({ inset, width: measuredWidth });
    }
  }

  if (rest.inset < 0 || destinationSurface <= 0) {
    return { boxWidth: null, contentWidth: null, transitioning };
  }

  const contentWidth = destinationSurface - rest.inset;
  return {
    boxWidth: transitioning ? Math.max(contentWidth, rest.width) : null,
    contentWidth,
    transitioning,
  };
}
