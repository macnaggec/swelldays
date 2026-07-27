import { useSyncExternalStore } from 'react';

/**
 * The continuous layout-viewport measurement — `window.innerWidth` /
 * `window.innerHeight` — deliberately separate from the discrete capability snapshot
 * in `viewportCapabilities` because it changes on every resize frame rather than only
 * when a band boundary is crossed. This is the module M05 extends with visual-viewport
 * geometry, and it is the only module permitted to read `window.visualViewport` when
 * that lands.
 */
export interface ViewportMetrics {
  readonly layoutViewportWidthPx: number;
  readonly layoutViewportHeightPx: number;
}

/** The server / first-paint fallback, matching the compact base band. */
export const indeterminateViewportMetrics: ViewportMetrics = {
  layoutViewportWidthPx: 390,
  layoutViewportHeightPx: 844,
};

let cachedMetrics: ViewportMetrics | undefined;

function metricsMatch(left: ViewportMetrics, right: ViewportMetrics) {
  return left.layoutViewportWidthPx === right.layoutViewportWidthPx
    && left.layoutViewportHeightPx === right.layoutViewportHeightPx;
}

function subscribeViewportMetrics(onStoreChange: () => void) {
  window.addEventListener('resize', onStoreChange);
  return () => window.removeEventListener('resize', onStoreChange);
}

export function getViewportMetricsSnapshot(): ViewportMetrics {
  const nextMetrics: ViewportMetrics = {
    layoutViewportWidthPx: window.innerWidth,
    layoutViewportHeightPx: window.innerHeight,
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
