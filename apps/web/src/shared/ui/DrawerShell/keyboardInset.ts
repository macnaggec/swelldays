export interface KeyboardInsetInput {
  layoutViewportHeightPx: number;
  visualViewportHeightPx: number;
  visualViewportOffsetTopPx: number;
}

/**
 * A `position: fixed` surface stays pinned to the full layout viewport when a software
 * keyboard opens (the viewport itself does not shrink), so the keyboard instead covers a
 * strip at the surface's bottom. This is the height of that covered strip.
 */
export function deriveKeyboardInsetPx({
  layoutViewportHeightPx,
  visualViewportHeightPx,
  visualViewportOffsetTopPx,
}: KeyboardInsetInput): number {
  return Math.max(0, layoutViewportHeightPx - visualViewportHeightPx - visualViewportOffsetTopPx);
}
