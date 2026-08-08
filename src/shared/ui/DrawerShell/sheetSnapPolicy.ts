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
 * control beneath the drag handle — rather than by the viewport. M02-d removed the 52px
 * section-switcher header from that composition, reducing the approved 132px peek by the
 * same amount. The compact search row adds 4px above and below the shared 8px chrome
 * inset, producing the approved even 12px breathing room.
 */
export const SHEET_PEEK_HEIGHT_PX = 84;

/**
 * Peek height for a sheet whose header row (back chevron + title) stays visible at
 * Peek, unlike Browse's own sheet, which has no header row at all. 24px drag handle +
 * 52px header row (--wa-panel-chrome-height) + 8+44+8px spot-search row (coarse-pointer
 * control height, the real case on a phone) = 136px.
 */
export const SHEET_PEEK_WITH_HEADER_HEIGHT_PX = 136;

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
