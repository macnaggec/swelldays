import { createContext, useContext, useState } from 'react';

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

/**
 * The width this element will have once the drawer stops moving, or null when it is
 * already there (or is not inside a drawer at all).
 *
 * Takes the caller's own measured width so it can work out how much narrower than the
 * surface this element sits — padding, and anything beside it such as the gallery's
 * date rail. That gap does not scale when the panel does, so it is captured while
 * standing still and subtracted, rather than scaling the caller's own width, which
 * would overshoot by twice the gap.
 *
 * The answer arrives in the same render that the toggle is pressed. A caller that
 * instead waited for its own resize measurement would be a frame behind: for that one
 * frame it would still be arranged for the old width while already occupying the new
 * one, which is long enough to see a single card stretched across the full panel.
 */
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
