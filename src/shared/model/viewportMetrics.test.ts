import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { getViewportMetricsSnapshot, indeterminateViewportMetrics, useViewportMetrics } from './viewportMetrics';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

describe('viewport metrics', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
  });

  it('falls back to the compact base band size when indeterminate', () => {
    expect(indeterminateViewportMetrics).toEqual({
      layoutViewportWidthPx: 390,
      layoutViewportHeightPx: 844,
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
    expect(second).toEqual({ layoutViewportWidthPx: 1280, layoutViewportHeightPx: 800 });
  });

  it('updates subscribers on resize', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    const { result } = renderHook(() => useViewportMetrics());
    expect(result.current).toEqual({ layoutViewportWidthPx: 1024, layoutViewportHeightPx: 768 });

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toEqual({ layoutViewportWidthPx: 500, layoutViewportHeightPx: 900 });
  });
});
