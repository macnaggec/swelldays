import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getViewportMetricsSnapshot,
  indeterminateViewportMetrics,
  useViewportMetrics,
  waitForKeyboardViewportToSettle,
} from './viewportMetrics';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

describe('viewport metrics', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('falls back to the compact base band size when indeterminate', () => {
    expect(indeterminateViewportMetrics).toEqual({
      layoutViewportWidthPx: 390,
      layoutViewportHeightPx: 844,
      visualViewportWidthPx: 390,
      visualViewportHeightPx: 844,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });
  });

  it('keeps snapshot identity across repeated reads when the window is unchanged', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const first = getViewportMetricsSnapshot();
    const second = getViewportMetricsSnapshot();
    expect(second).toBe(first);
  });

  it('returns a new snapshot carrying the new values after a resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const first = getViewportMetricsSnapshot();

    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const second = getViewportMetricsSnapshot();
    expect(second).not.toBe(first);
    expect(second).toEqual({
      layoutViewportWidthPx: 1280,
      layoutViewportHeightPx: 800,
      visualViewportWidthPx: 1280,
      visualViewportHeightPx: 800,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });
  });

  it('falls back to innerWidth/innerHeight for the visual-viewport fields when window.visualViewport is undefined', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    expect(window.visualViewport).toBeUndefined();

    expect(getViewportMetricsSnapshot()).toEqual({
      layoutViewportWidthPx: 1024,
      layoutViewportHeightPx: 768,
      visualViewportWidthPx: 1024,
      visualViewportHeightPx: 768,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });
  });

  it('reads real values from a stubbed window.visualViewport', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    vi.stubGlobal('visualViewport', {
      width: 1024,
      height: 500,
      offsetLeft: 0,
      offsetTop: 20,
    } as unknown as VisualViewport);

    expect(getViewportMetricsSnapshot()).toEqual({
      layoutViewportWidthPx: 1024,
      layoutViewportHeightPx: 768,
      visualViewportWidthPx: 1024,
      visualViewportHeightPx: 500,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 20,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });
  });

  it('keeps the layout viewport stable when iOS Safari shrinks innerHeight for the keyboard', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 395, configurable: true });
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(663);
    vi.stubGlobal('visualViewport', {
      width: 390,
      height: 395,
      offsetLeft: 0,
      offsetTop: 268,
    } as unknown as VisualViewport);

    expect(getViewportMetricsSnapshot()).toMatchObject({
      layoutViewportWidthPx: 390,
      layoutViewportHeightPx: 663,
      visualViewportWidthPx: 390,
      visualViewportHeightPx: 395,
      visualViewportOffsetTopPx: 268,
    });
  });

  it('updates subscribers on resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const { result } = renderHook(() => useViewportMetrics());
    expect(result.current).toEqual({
      layoutViewportWidthPx: 1024,
      layoutViewportHeightPx: 768,
      visualViewportWidthPx: 1024,
      visualViewportHeightPx: 768,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toEqual({
      layoutViewportWidthPx: 500,
      layoutViewportHeightPx: 900,
      visualViewportWidthPx: 500,
      visualViewportHeightPx: 900,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 0,
      safeAreaBottomPx: 0,
    });
  });

  it('updates subscribers when window.visualViewport dispatches a resize event', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const listeners = new Set<() => void>();
    const stubVisualViewport = {
      width: 1024,
      height: 768,
      offsetLeft: 0,
      offsetTop: 0,
      addEventListener: (_type: string, listener: () => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        listeners.delete(listener);
      },
    };
    vi.stubGlobal('visualViewport', stubVisualViewport as unknown as VisualViewport);

    const { result } = renderHook(() => useViewportMetrics());
    expect(result.current.visualViewportHeightPx).toBe(768);

    act(() => {
      stubVisualViewport.height = 500;
      stubVisualViewport.offsetTop = 20;
      listeners.forEach((listener) => listener());
    });

    expect(result.current.visualViewportHeightPx).toBe(500);
    expect(result.current.visualViewportOffsetTopPx).toBe(20);
  });

  it('waits for a keyboard-reduced visual viewport to recover before settling', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 500,
      offsetLeft: 0,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visualViewport as unknown as VisualViewport);

    let settled = false;
    const settling = waitForKeyboardViewportToSettle().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);

    visualViewport.height = 844;
    visualViewport.dispatchEvent(new Event('resize'));
    await vi.advanceTimersByTimeAsync(100);

    expect(settled).toBe(true);
    await settling;
  });

  it('does not delay when the visual viewport is not keyboard-reduced', async () => {
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visualViewport as unknown as VisualViewport);

    await expect(waitForKeyboardViewportToSettle()).resolves.toBeUndefined();
  });

  it('stops waiting if the browser never reports keyboard recovery', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    const visualViewport = Object.assign(new EventTarget(), {
      width: 390,
      height: 500,
      offsetLeft: 0,
      offsetTop: 0,
    });
    vi.stubGlobal('visualViewport', visualViewport as unknown as VisualViewport);

    let settled = false;
    const settling = waitForKeyboardViewportToSettle().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(2_000);

    expect(settled).toBe(true);
    await settling;
  });

  it('resolves env(safe-area-inset-*) to real px through the platform, defaulting to 0 when unreported', () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });

    expect(getViewportMetricsSnapshot()).toMatchObject({ safeAreaTopPx: 0, safeAreaBottomPx: 0 });

    const realGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, ...rest) => (
      element instanceof HTMLElement && element.dataset.waSafeAreaProbe === 'true'
        ? { paddingTop: '59px', paddingBottom: '34px' } as CSSStyleDeclaration
        : realGetComputedStyle(element, ...rest)
    ));

    expect(getViewportMetricsSnapshot()).toEqual({
      layoutViewportWidthPx: 390,
      layoutViewportHeightPx: 844,
      visualViewportWidthPx: 390,
      visualViewportHeightPx: 844,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
      safeAreaTopPx: 59,
      safeAreaBottomPx: 34,
    });
  });
});
