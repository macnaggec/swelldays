import { useSyncExternalStore } from 'react';

/**
 * The continuous layout-viewport measurement — `window.innerWidth` /
 * `window.innerHeight` — deliberately separate from the discrete capability snapshot
 * in `viewportCapabilities` because it changes on every resize frame rather than only
 * when a band boundary is crossed. M05 extends this with visual-viewport geometry (the
 * keyboard-aware viewport), and this is the only module permitted to read
 * `window.visualViewport`.
 */
export interface ViewportMetrics {
  readonly layoutViewportWidthPx: number;
  readonly layoutViewportHeightPx: number;
  readonly visualViewportWidthPx: number;
  readonly visualViewportHeightPx: number;
  readonly visualViewportOffsetLeftPx: number;
  readonly visualViewportOffsetTopPx: number;
}

/** The server / first-paint fallback, matching the compact base band. */
export const indeterminateViewportMetrics: ViewportMetrics = {
  layoutViewportWidthPx: 390,
  layoutViewportHeightPx: 844,
  visualViewportWidthPx: 390,
  visualViewportHeightPx: 844,
  visualViewportOffsetLeftPx: 0,
  visualViewportOffsetTopPx: 0,
};

let cachedMetrics: ViewportMetrics | undefined;

function metricsMatch(left: ViewportMetrics, right: ViewportMetrics) {
  return left.layoutViewportWidthPx === right.layoutViewportWidthPx
    && left.layoutViewportHeightPx === right.layoutViewportHeightPx
    && left.visualViewportWidthPx === right.visualViewportWidthPx
    && left.visualViewportHeightPx === right.visualViewportHeightPx
    && left.visualViewportOffsetLeftPx === right.visualViewportOffsetLeftPx
    && left.visualViewportOffsetTopPx === right.visualViewportOffsetTopPx;
}

function subscribeViewportMetrics(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  const visualViewport = window.visualViewport;
  visualViewport?.addEventListener('resize', onStoreChange);
  visualViewport?.addEventListener('scroll', onStoreChange);
  return () => {
    window.removeEventListener('resize', onStoreChange);
    visualViewport?.removeEventListener('resize', onStoreChange);
    visualViewport?.removeEventListener('scroll', onStoreChange);
  };
}

export function getViewportMetricsSnapshot(): ViewportMetrics {
  const visualViewport = window.visualViewport;
  const nextMetrics: ViewportMetrics = {
    layoutViewportWidthPx: window.innerWidth,
    layoutViewportHeightPx: window.innerHeight,
    visualViewportWidthPx: visualViewport?.width ?? window.innerWidth,
    visualViewportHeightPx: visualViewport?.height ?? window.innerHeight,
    visualViewportOffsetLeftPx: visualViewport?.offsetLeft ?? 0,
    visualViewportOffsetTopPx: visualViewport?.offsetTop ?? 0,
  };

  if (cachedMetrics && metricsMatch(cachedMetrics, nextMetrics)) return cachedMetrics;

  cachedMetrics = nextMetrics;
  return nextMetrics;
}

export function useViewportMetrics(): ViewportMetrics {
  return useSyncExternalStore(
    subscribeViewportMetrics,
    getViewportMetricsSnapshot,
    () => indeterminateViewportMetrics,
  );
}
