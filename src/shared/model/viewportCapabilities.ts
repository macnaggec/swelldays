import { useSyncExternalStore } from 'react';

const CONSTRAINED_MIN_WIDTH_PX = 768;
const WIDE_MIN_WIDTH_PX = 1200;
const REGULAR_MIN_HEIGHT_PX = 700;

const capabilityQueries = [
  '(pointer: coarse)',
  '(pointer: fine)',
  '(hover: hover)',
  '(prefers-reduced-motion: reduce)',
] as const;

export interface ViewportCapabilities {
  sizeBand: 'compact' | 'constrained' | 'wide';
  heightBand: 'short' | 'regular';
  primaryPointer: 'coarse' | 'fine' | 'none';
  supportsHover: boolean;
  prefersReducedMotion: boolean;
  viewportWidthPx: number;
}

/**
 * The base band assumed when viewport capabilities are indeterminate — server
 * render, first paint, restored sessions, or unknown embedding contexts. Compact
 * with no hover and a coarse pointer, so wider bands, hover, and fine pointer are
 * always additive enhancements over a working base rather than prerequisites.
 */
export const indeterminateViewportCapabilities: ViewportCapabilities = {
  sizeBand: 'compact',
  heightBand: 'regular',
  primaryPointer: 'coarse',
  supportsHover: false,
  prefersReducedMotion: false,
  viewportWidthPx: 390,
};

let cachedSnapshot: ViewportCapabilities | undefined;

function snapshotsMatch(left: ViewportCapabilities, right: ViewportCapabilities) {
  return left.sizeBand === right.sizeBand
    && left.heightBand === right.heightBand
    && left.primaryPointer === right.primaryPointer
    && left.supportsHover === right.supportsHover
    && left.prefersReducedMotion === right.prefersReducedMotion
    && left.viewportWidthPx === right.viewportWidthPx;
}

function subscribeViewportCapabilities(onStoreChange: () => void) {
  const mediaQueries = capabilityQueries.map((query) => window.matchMedia(query));

  window.addEventListener('resize', onStoreChange);
  mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', onStoreChange));

  return () => {
    window.removeEventListener('resize', onStoreChange);
    mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', onStoreChange));
  };
}

export function getViewportCapabilitiesSnapshot(): ViewportCapabilities {
  const viewportWidthPx = window.innerWidth;
  const viewportHeightPx = window.innerHeight;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const nextSnapshot: ViewportCapabilities = {
    sizeBand: viewportWidthPx >= WIDE_MIN_WIDTH_PX
      ? 'wide'
      : viewportWidthPx >= CONSTRAINED_MIN_WIDTH_PX
        ? 'constrained'
        : 'compact',
    heightBand: viewportHeightPx >= REGULAR_MIN_HEIGHT_PX ? 'regular' : 'short',
    primaryPointer: coarsePointer ? 'coarse' : finePointer ? 'fine' : 'none',
    supportsHover: window.matchMedia('(hover: hover)').matches,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    viewportWidthPx,
  };

  if (cachedSnapshot && snapshotsMatch(cachedSnapshot, nextSnapshot)) return cachedSnapshot;

  cachedSnapshot = nextSnapshot;
  return nextSnapshot;
}

export function useViewportCapabilities(): ViewportCapabilities {
  return useSyncExternalStore(
    subscribeViewportCapabilities,
    getViewportCapabilitiesSnapshot,
    () => indeterminateViewportCapabilities,
  );
}
