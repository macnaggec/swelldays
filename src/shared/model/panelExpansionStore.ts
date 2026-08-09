import { create } from 'zustand';

/** Single source of truth for the panel's two fixed widths, shared with the globe's camera occlusion math. */
export const PANEL_WIDTH_VW = { compact: 25, expanded: 75 } as const;

/**
 * Compact's own floor: three photo tiles at Gallery's compact-density target size
 * (120px, `GALLERY_DENSITY.compact.targetTilePx`) plus the panel's own chrome inset —
 * 360px total, the exact surface width a 1440px-wide viewport already produces at
 * 25vw (the reference "3 columns fit" case `DrawerShell.test.tsx` asserts). Below
 * that viewport width, a pure 25vw fraction would squeeze Gallery below 3 columns
 * and cramp every other compact panel's own controls too, since every panel shares
 * this one width. Expanded has no floor — 75vw is already generous at any real
 * desktop width.
 */
export const PANEL_COMPACT_MIN_WIDTH_PX = 360;

/** The persistent panel's actual pixel width for a given state and viewport — the one function that must own every place this app renders, measures, or publishes that width, so they can never disagree. */
export function resolvePanelWidthPx(
  state: keyof typeof PANEL_WIDTH_VW,
  viewportWidthPx: number,
): number {
  const vwWidthPx = viewportWidthPx * (PANEL_WIDTH_VW[state] / 100);
  return state === 'compact' ? Math.max(vwWidthPx, PANEL_COMPACT_MIN_WIDTH_PX) : vwWidthPx;
}

interface PanelExpansionPreferences {
  browsingExpanded: boolean;
  galleryExpanded: boolean;
  setBrowsingPanelExpanded: (expanded: boolean) => void;
  setGalleryPanelExpanded: (expanded: boolean) => void;
}

/** Authoritative user preferences for the two panel modes that support manual expansion. */
export const usePanelExpansionStore = create<PanelExpansionPreferences>((set) => ({
  browsingExpanded: false,
  galleryExpanded: true,
  setBrowsingPanelExpanded: (expanded) => set({ browsingExpanded: expanded }),
  setGalleryPanelExpanded: (expanded) => set({ galleryExpanded: expanded }),
}));
