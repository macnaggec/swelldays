import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getViewportMetricsSnapshot, indeterminateViewportMetrics, useViewportMetrics } from './viewportMetrics';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

describe('viewport metrics', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
    vi.unstubAllGlobals();
  });

  it('falls back to the compact base band size when indeterminate', () => {
    expect(indeterminateViewportMetrics).toEqual({
      layoutViewportWidthPx: 390,
      layoutViewportHeightPx: 844,
      visualViewportWidthPx: 390,
      visualViewportHeightPx: 844,
      visualViewportOffsetLeftPx: 0,
      visualViewportOffsetTopPx: 0,
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
});
