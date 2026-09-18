import { useSyncExternalStore } from 'react';

/**
 * The continuous layout-viewport measurement — `document.documentElement.clientWidth` /
 * `clientHeight` — deliberately separate from the discrete capability snapshot in
 * `viewportCapabilities` because it changes on every real layout resize rather than only
 * when a band boundary is crossed. Unlike `window.innerHeight` on iOS Safari, the root
 * client height stays stable when the software keyboard shrinks and pans the visual
 * viewport. M05 extends this with visual-viewport geometry (the keyboard-aware viewport),
 * and this is the only module permitted to read `window.visualViewport`. It is also the
 * only module permitted to read the safe-area-inset environment values (resolved to real
 * px, for JS pixel math that can't consume tokens.css's `--wa-safe-area-*` custom
 * properties directly).
 */
export interface ViewportMetrics {
  readonly layoutViewportWidthPx: number;
  readonly layoutViewportHeightPx: number;
  readonly visualViewportWidthPx: number;
  readonly visualViewportHeightPx: number;
  readonly visualViewportOffsetLeftPx: number;
  readonly visualViewportOffsetTopPx: number;
  /**
   * `env(safe-area-inset-top/bottom)` resolved to real px, for the JS-side pixel math
   * (DrawerShell's sheet snap heights/positions) that can't just consume the CSS
   * custom properties tokens.css already derives from the same env() values. Zero
   * wherever the platform doesn't report an inset (most browsers, non-edge-to-edge
   * contexts) — the same "no notch" assumption indeterminateViewportMetrics already
   * makes for every other field here.
   */
  readonly safeAreaTopPx: number;
  readonly safeAreaBottomPx: number;
}

/** The server / first-paint fallback, matching the compact base band. */
export const indeterminateViewportMetrics: ViewportMetrics = {
  layoutViewportWidthPx: 390,
  layoutViewportHeightPx: 844,
  visualViewportWidthPx: 390,
  visualViewportHeightPx: 844,
  visualViewportOffsetLeftPx: 0,
  visualViewportOffsetTopPx: 0,
  safeAreaTopPx: 0,
  safeAreaBottomPx: 0,
};

/**
 * The browser's instantaneous inner viewport, for event-time geometry that must
 * preserve the exact screen bounds used by pointer and wheel gestures. Raw
 * `window.inner*` reads stay behind this owner so consumers cannot invent a
 * second viewport authority.
 */
export function getViewportInnerSize(): { readonly widthPx: number; readonly heightPx: number } {
  return { widthPx: window.innerWidth, heightPx: window.innerHeight };
}

/**
 * The rendered document's stable layout viewport. Mobile Safari can transiently
 * publish a desktop-sized `window.innerWidth` while dismissing the software
 * keyboard even though the document continues to lay out at phone width. The
 * root client box remains aligned with the CSS viewport through that transition.
 */
export function getLayoutViewportSize(): { readonly widthPx: number; readonly heightPx: number } {
  return {
    widthPx: document.documentElement.clientWidth || window.innerWidth,
    heightPx: document.documentElement.clientHeight || window.innerHeight,
  };
}

let cachedMetrics: ViewportMetrics | undefined;

const KEYBOARD_VIEWPORT_REDUCTION_THRESHOLD_PX = 120;
const KEYBOARD_VIEWPORT_RECOVERY_QUIET_MS = 50;
const KEYBOARD_VIEWPORT_RECOVERY_TIMEOUT_MS = 1_000;

function metricsMatch(left: ViewportMetrics, right: ViewportMetrics) {
  return left.layoutViewportWidthPx === right.layoutViewportWidthPx
    && left.layoutViewportHeightPx === right.layoutViewportHeightPx
    && left.visualViewportWidthPx === right.visualViewportWidthPx
    && left.visualViewportHeightPx === right.visualViewportHeightPx
    && left.visualViewportOffsetLeftPx === right.visualViewportOffsetLeftPx
    && left.visualViewportOffsetTopPx === right.visualViewportOffsetTopPx
    && left.safeAreaTopPx === right.safeAreaTopPx
    && left.safeAreaBottomPx === right.safeAreaBottomPx;
}

let safeAreaProbeElement: HTMLDivElement | undefined;

/**
 * A hidden, reused element whose padding is set from env(safe-area-inset-*) so its
 * computed style resolves those insets to real px — env() otherwise only exists inside
 * CSS and can't be read from a custom property's string value.
 */
function getSafeAreaProbeElement(): HTMLDivElement {
  if (safeAreaProbeElement?.isConnected) return safeAreaProbeElement;
  const probe = document.createElement('div');
  probe.dataset.waSafeAreaProbe = 'true';
  probe.style.position = 'fixed';
  probe.style.inset = '0';
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  safeAreaProbeElement = probe;
  return probe;
}

function readSafeAreaInsetsPx(): { safeAreaTopPx: number; safeAreaBottomPx: number } {
  if (typeof document === 'undefined') return { safeAreaTopPx: 0, safeAreaBottomPx: 0 };
  const computed = window.getComputedStyle(getSafeAreaProbeElement());
  return {
    safeAreaTopPx: parseFloat(computed.paddingTop) || 0,
    safeAreaBottomPx: parseFloat(computed.paddingBottom) || 0,
  };
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

function isVisualViewportKeyboardReduced(visualViewport: VisualViewport): boolean {
  const layoutViewportHeightPx = document.documentElement.clientHeight || window.innerHeight;
  return layoutViewportHeightPx - visualViewport.height > KEYBOARD_VIEWPORT_REDUCTION_THRESHOLD_PX
    || visualViewport.offsetTop > KEYBOARD_VIEWPORT_REDUCTION_THRESHOLD_PX;
}

/**
 * Waits for a software-keyboard visual viewport to recover after its text field blurs.
 * Desktop and already-recovered viewports resolve immediately. The timeout prevents a
 * browser that omits the recovery event from trapping the action that requested it.
 */
export function waitForKeyboardViewportToSettle(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve();

  const visualViewport = window.visualViewport;
  if (!visualViewport || !isVisualViewportKeyboardReduced(visualViewport)) return Promise.resolve();

  return new Promise((resolve) => {
    let recoveryTimer: number | undefined;

    const finish = () => {
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      window.clearTimeout(recoveryTimeout);
      window.removeEventListener('resize', handleViewportChange);
      visualViewport.removeEventListener('resize', handleViewportChange);
      visualViewport.removeEventListener('scroll', handleViewportChange);
      resolve();
    };

    const handleViewportChange = () => {
      if (recoveryTimer !== undefined) window.clearTimeout(recoveryTimer);
      recoveryTimer = undefined;
      if (isVisualViewportKeyboardReduced(visualViewport)) return;
      recoveryTimer = window.setTimeout(finish, KEYBOARD_VIEWPORT_RECOVERY_QUIET_MS);
    };

    window.addEventListener('resize', handleViewportChange);
    visualViewport.addEventListener('resize', handleViewportChange);
    visualViewport.addEventListener('scroll', handleViewportChange);
    const recoveryTimeout = window.setTimeout(finish, KEYBOARD_VIEWPORT_RECOVERY_TIMEOUT_MS);
  });
}

export function getViewportMetricsSnapshot(): ViewportMetrics {
  const visualViewport = window.visualViewport;
  const {
    widthPx: layoutViewportWidthPx,
    heightPx: layoutViewportHeightPx,
  } = getLayoutViewportSize();
  const nextMetrics: ViewportMetrics = {
    layoutViewportWidthPx,
    layoutViewportHeightPx,
    visualViewportWidthPx: visualViewport?.width ?? window.innerWidth,
    visualViewportHeightPx: visualViewport?.height ?? window.innerHeight,
    visualViewportOffsetLeftPx: visualViewport?.offsetLeft ?? 0,
    visualViewportOffsetTopPx: visualViewport?.offsetTop ?? 0,
    ...readSafeAreaInsetsPx(),
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
