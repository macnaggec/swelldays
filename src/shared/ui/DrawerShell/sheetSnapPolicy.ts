export type SheetSnap = 'peek' | 'half' | 'full';

/** The snaps in ascending order of height. */
export const SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'half', 'full'];

/** Snap heights that scale with the viewport, as a fraction of its dynamic height. */
export const SHEET_SNAP_FRACTIONS: { readonly half: number; readonly full: number } = {
  half: 0.34,
  full: 0.9,
};

/**
 * Resting height of the peek snap. Sized by its own content — the search row and upload
 * control — rather than by the viewport, so it is a constant here until M02 mounts that
 * content and can measure it.
 */
export const SHEET_PEEK_HEIGHT_PX = 132;

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
  const half = clamp(Math.round(viewportHeightPx * SHEET_SNAP_FRACTIONS.half), peek, viewportHeightPx);
  const full = clamp(Math.round(viewportHeightPx * SHEET_SNAP_FRACTIONS.full), half, viewportHeightPx);

  return { peek, half, full };
}

export interface NearestSheetSnapInput {
  heightPx: number;
  /** Vertical speed of the sheet's top edge, px/s. Positive means moving down. */
  velocityPx: number;
  heights: SheetSnapHeights;
}

export function nearestSheetSnap({ heightPx, velocityPx, heights }: NearestSheetSnapInput): SheetSnap {
  if (velocityPx <= -SHEET_FLICK_VELOCITY_PX_PER_S) {
    for (const snap of SHEET_SNAPS) {
      if (heights[snap] > heightPx) return snap;
    }
    return 'full';
  }

  if (velocityPx >= SHEET_FLICK_VELOCITY_PX_PER_S) {
    let candidate: SheetSnap | null = null;
    for (const snap of SHEET_SNAPS) {
      if (heights[snap] < heightPx) candidate = snap;
      else break;
    }
    return candidate ?? 'peek';
  }

  let nearest: SheetSnap | null = null;
  let nearestDistance = Infinity;
  for (const snap of SHEET_SNAPS) {
    const distance = Math.abs(heights[snap] - heightPx);
    if (distance < nearestDistance) {
      nearest = snap;
      nearestDistance = distance;
    }
  }
  return nearest ?? 'peek';
}

/** The snap one step taller than `snap`, or `snap` when it is already the tallest. */
export function nextSheetSnapUp(snap: SheetSnap): SheetSnap {
  const index = SHEET_SNAPS.indexOf(snap);
  const next = SHEET_SNAPS[index + 1];
  return next ?? snap;
}
