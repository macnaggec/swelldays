export type SheetSnap = 'peek' | 'half' | 'full';

/** The snaps in ascending order of height. */
export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

/**
 * The middle snap scales with the dynamic viewport. The top snap instead leaves a
 * fixed strip above the sheet, so the account/cart plate stays fully behind the
 * sheet on every regular-height phone rather than reappearing on taller screens.
 */
const SHEET_HALF_HEIGHT_FRACTION = 0.34;
const SHEET_FULL_TOP_INSET_PX = 24;

/**
 * Resting height of the peek snap. Sized by its own content — the search row and upload
 * control beneath the drag handle — rather than by the viewport. 24px drag handle + 65px
 * .stickyChrome (its real rendered height): 9px+4px padding-block, 4px+4px margin-block
 * from PanelRouteLayout.module.css's compact-toolbar rule, and the 44px coarse-pointer
 * control height) = 89px. The 9px/4px padding-block split is deliberate, not a typo: the
 * drag handle's own 24px band already leaves 11px of clearance below its grabber pill
 * before the row starts, so 9px here keeps the *visible* gap above the row (11px handle
 * clearance + 9px + 4px = 24px). The gap below the row to the sheet's own bottom edge
 * (4px + 4px = 8px) is set independently, matching Upload's own sheet — the reference
 * minimum for this gap. Was 105px with a 9px/20px split (24px above, 24px below);
 * before that, 116px with a symmetric 20px/20px split, nearly 1.5x more clearance
 * above the row than below.
 */
export const SHEET_PEEK_HEIGHT_PX = 89;

/**
 * Peek height for a sheet whose header row (back chevron + title) stays visible at
 * Peek, unlike Browse's own sheet, which has no header row at all. 24px drag handle +
 * 44px header row (SidePanel's `.panelTop`, unconstrained by height and so sized by its
 * tallest child — the back button, `--wa-control-size-compact`, which is 44px under the
 * `(pointer: coarse)` media query that always matches on the phone this sheet renders
 * on) + 8+44+8px spot-search row (coarse-pointer control height) = 128px. Was 136px with
 * an explicit `min-height: 52px` (`--wa-panel-chrome-height`) on `.panelTop` that forced
 * the row 8px taller than its real content everywhere it renders, not just here.
 */
export const SHEET_PEEK_WITH_HEADER_HEIGHT_PX = 128;

/** Sheet-top speed, px/s, above which a release reads as a flick rather than a placement. */
export const SHEET_FLICK_VELOCITY_PX_PER_S = 400;

export interface SheetSnapHeightsInput {
  viewportHeightPx: number;
  peekHeightPx: number;
}

export type SheetSnapHeights = Readonly<Record<SheetSnap, number>>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveSheetSnapHeights({
  viewportHeightPx,
  peekHeightPx,
}: SheetSnapHeightsInput): SheetSnapHeights {
  const peek = clamp(peekHeightPx, 0, viewportHeightPx);
  const half = clamp(Math.round(viewportHeightPx * SHEET_HALF_HEIGHT_FRACTION), peek, viewportHeightPx);
  const full = clamp(viewportHeightPx - SHEET_FULL_TOP_INSET_PX, half, viewportHeightPx);

  return { peek, half, full };
}

export interface NearestSheetSnapInput {
  heightPx: number;
  /** Vertical speed of the sheet's top edge, px/s. Positive means moving down. */
  velocityPx: number;
  heights: SheetSnapHeights;
  /** Snaps this sheet may land on. Defaults to all three (Browse's own sheet). */
  availableSnaps?: readonly SheetSnap[];
}

export function nearestSheetSnap({
  heightPx,
  velocityPx,
  heights,
  availableSnaps = SHEET_SNAPS,
}: NearestSheetSnapInput): SheetSnap {
  if (velocityPx <= -SHEET_FLICK_VELOCITY_PX_PER_S) {
    for (const snap of availableSnaps) {
      if (heights[snap] > heightPx) return snap;
    }
    return 'full';
  }

  if (velocityPx >= SHEET_FLICK_VELOCITY_PX_PER_S) {
    let candidate: SheetSnap | null = null;
    for (const snap of availableSnaps) {
      if (heights[snap] < heightPx) candidate = snap;
      else break;
    }
    return candidate ?? 'peek';
  }

  let nearest: SheetSnap | null = null;
  let nearestDistance = Infinity;
  for (const snap of availableSnaps) {
    const distance = Math.abs(heights[snap] - heightPx);
    if (distance < nearestDistance) {
      nearest = snap;
      nearestDistance = distance;
    }
  }
  return nearest ?? 'peek';
}

export interface BrowseSheetNavigationOpacity {
  /** 1 while the sheet has not yet risen past `half`; 0 once it reaches `full`. */
  opacity: number;
  /** True once opacity reaches 0 — the plate is inert and hidden from accessibility. */
  hidden: boolean;
}

export function resolveBrowseSheetNavigationOpacity({
  visibleHeightPx,
  heights,
}: {
  visibleHeightPx: number;
  heights: SheetSnapHeights;
}): BrowseSheetNavigationOpacity {
  const span = heights.full - heights.half;
  const progress = span <= 0 ? 1 : (visibleHeightPx - heights.half) / span;
  const opacity = clamp(1 - progress, 0, 1);
  return { opacity, hidden: opacity <= 0 };
}
