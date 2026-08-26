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
 * Browse Peek's physical standalone height. On an iPhone it is the exact bottom-up
 * sequence approved for this surface: 8px screen-edge gap + 5px iOS home indicator +
 * 8px gap + 44px search row + 16px Full-reference gap + 5px sheet grabber +
 * 8px top-edge gap = 94px.
 * The bottom three segments mirror --wa-floating-chrome-bottom-offset's own
 * standalone value in tokens.css — every bottom-based plate clears the true
 * edge the same way, whether it is a floating footer or a sheet's own Peek row.
 */
export const SHEET_PEEK_HEIGHT_PX = 94;
/**
 * What a browser tab removes from each sheet's own standalone peek-height
 * constant: the 5px iOS indicator plus one of its two flanking 8px gaps,
 * since a plain tab has no physical indicator to clear and keeps only the
 * single flat --wa-floating-chrome-edge-gap.
 */
const STANDALONE_HOME_INDICATOR_RESERVE_PX = 13;

interface SheetPeekHeightInput {
  safeAreaBottomPx: number;
  isStandalone: boolean;
}

export function resolveBrowseSheetPeekHeightPx({
  safeAreaBottomPx,
  isStandalone,
}: SheetPeekHeightInput): number {
  const physicalHeightPx = isStandalone
    ? SHEET_PEEK_HEIGHT_PX
    : SHEET_PEEK_HEIGHT_PX - STANDALONE_HOME_INDICATOR_RESERVE_PX;
  return Math.max(0, physicalHeightPx - (isStandalone ? safeAreaBottomPx : 0));
}

/**
 * Peek height for a sheet whose header row (back chevron + title) stays visible at
 * Peek, unlike Browse's own sheet, which has no header row at all. Its physical
 * stack is 8px sheet edge + 5px grabber + 0px + 52px header + 8px + 44px search +
 * 8px + 5px iOS indicator + 8px screen edge = 138px. The header's own row
 * (SidePanel's panelTop) is its coarse-pointer back control height plus the 8px
 * of centering slack that row's min-height always adds around that control —
 * not the bare control height alone. The bottom three segments mirror Browse's
 * own tail above (STANDALONE_HOME_INDICATOR_RESERVE_PX).
 */
export const SHEET_PEEK_WITH_HEADER_HEIGHT_PX = 138;

export function resolveHeaderSheetPeekHeightPx({
  safeAreaBottomPx,
  isStandalone,
}: SheetPeekHeightInput): number {
  const physicalHeightPx = isStandalone
    ? SHEET_PEEK_WITH_HEADER_HEIGHT_PX
    : SHEET_PEEK_WITH_HEADER_HEIGHT_PX - STANDALONE_HOME_INDICATOR_RESERVE_PX;
  return Math.max(0, physicalHeightPx - (isStandalone ? safeAreaBottomPx : 0));
}

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
