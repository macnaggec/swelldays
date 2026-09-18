import { useSyncExternalStore } from 'react';
import { getLayoutViewportSize } from './viewportMetrics';

const CONSTRAINED_MIN_WIDTH_PX = 768;
const WIDE_MIN_WIDTH_PX = 1200;
const REGULAR_MIN_HEIGHT_PX = 700;

const capabilityQueries = [
  '(pointer: coarse)',
  '(pointer: fine)',
  '(hover: hover)',
  '(prefers-reduced-motion: reduce)',
  '(display-mode: standalone)',
] as const;

export interface ViewportCapabilities {
  sizeBand: 'compact' | 'constrained' | 'wide';
  heightBand: 'short' | 'regular';
  primaryPointer: 'coarse' | 'fine' | 'none';
  supportsHover: boolean;
  prefersReducedMotion: boolean;
  isStandalone: boolean;
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
  isStandalone: false,
};

let cachedSnapshot: ViewportCapabilities | undefined;

function snapshotsMatch(left: ViewportCapabilities, right: ViewportCapabilities) {
  return left.sizeBand === right.sizeBand
    && left.heightBand === right.heightBand
    && left.primaryPointer === right.primaryPointer
    && left.supportsHover === right.supportsHover
    && left.prefersReducedMotion === right.prefersReducedMotion
    && left.isStandalone === right.isStandalone;
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
  const { widthPx: viewportWidthPx, heightPx: viewportHeightPx } = getLayoutViewportSize();
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  // 'short' means landscape-constrained — genuinely not enough vertical room for a
  // bottom sheet — not merely a small screen. An upright phone that happens to be
  // short (e.g. a compact device's own portrait height) keeps 'regular': it is
  // narrower, not shorter-for-its-width, and a bottom sheet still fits it fine.
  const isRegularHeight = viewportHeightPx >= REGULAR_MIN_HEIGHT_PX || viewportWidthPx <= viewportHeightPx;
  const nextSnapshot: ViewportCapabilities = {
    // The constrained-regular tablet cell (Phase T) is retired in favor of reusing
    // desktop's own `wide` presentation at that width — product decision, 2026-08-15,
    // superseding T00–T04 (see docs/roadmaps/responsive-layout-foundation.md, Phase T).
    // Gated on regular height alone: the constrained-*short* cell (landscape phones,
    // Phase M, already approved and shipped) is a different, untouched piece of work
    // that happens to share this width range — narrowing here, not widening Phase T's
    // retirement into Phase M's, keeps that cell's own tested camera/map behavior
    // exactly as it was.
    sizeBand: viewportWidthPx >= WIDE_MIN_WIDTH_PX
      ? 'wide'
      : viewportWidthPx >= CONSTRAINED_MIN_WIDTH_PX
        ? (isRegularHeight ? 'wide' : 'constrained')
        : 'compact',
    heightBand: isRegularHeight ? 'regular' : 'short',
    primaryPointer: coarsePointer ? 'coarse' : finePointer ? 'fine' : 'none',
    supportsHover: window.matchMedia('(hover: hover)').matches,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    // `display-mode: standalone` alone misses iOS home-screen launches on several
    // Safari versions, where the media query never flips even though the app is
    // genuinely running full-screen with no browser chrome. `navigator.standalone`
    // is Apple's own non-standard, pre-media-query signal for exactly this case —
    // undefined everywhere else, so it only ever adds a true, never a false one.
    isStandalone: window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
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

export type ModalWorkspacePresentation = 'dialog' | 'portraitWorkspace' | 'landscapeWorkspace';

/**
 * Where a standalone Mantine <Modal> should render: a centered dialog on
 * desktop/tablet, but full-screen on a portrait phone or a landscape phone
 * (short height), where a centered dialog would be cramped. Shared so every
 * modal (auth, upload review, ...) full-screens on the same viewport bands
 * instead of each picking its own threshold.
 */
export function resolveModalWorkspacePresentation(
  sizeBand: ViewportCapabilities['sizeBand'],
  heightBand: ViewportCapabilities['heightBand'],
): ModalWorkspacePresentation {
  if (sizeBand === 'compact' && heightBand === 'regular') return 'portraitWorkspace';
  if (sizeBand !== 'wide' && heightBand === 'short') return 'landscapeWorkspace';
  return 'dialog';
}
