import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapRef } from 'react-map-gl';
import { useGlobeAnimation } from './useGlobeAnimation';

function createMapRef(zoom: number, isMoving = () => false): React.RefObject<MapRef | null> {
  const map = {
    getZoom: () => zoom,
    getCenter: () => ({ lng: 10, lat: 20 }),
    setCenter: vi.fn(),
    isMoving,
  };
  return {
    current: {
      getMap: () => map,
    } as unknown as MapRef,
  };
}

describe('useGlobeAnimation', () => {
  const requestAnimationFrameMock = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
  const cancelAnimationFrameMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    requestAnimationFrameMock.mockClear();
    cancelAnimationFrameMock.mockClear();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not queue another animation frame when the globe is zoomed in', () => {
    const mapRef = createMapRef(4);
    const { result } = renderHook(() => useGlobeAnimation(mapRef, { maxSpinZoom: 3 }));

    act(() => result.current.startSpinning());

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('leaves camera transitions uninterrupted and resumes rotation after they finish', () => {
    let moving = false;
    const mapRef = createMapRef(2, () => moving);
    const setCenter = mapRef.current!.getMap().setCenter;
    const { result } = renderHook(() => useGlobeAnimation(mapRef));
    act(() => result.current.startSpinning());
    expect(setCenter).toHaveBeenCalledTimes(1);
    vi.mocked(setCenter).mockClear();

    moving = true;
    act(() => requestAnimationFrameMock.mock.calls[0]![0](16));
    expect(setCenter).not.toHaveBeenCalled();
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(2);

    moving = false;
    act(() => requestAnimationFrameMock.mock.calls[1]![0](32));
    expect(setCenter).toHaveBeenCalledTimes(1);
  });

  it('cancels the queued animation frame when spinning stops', () => {
    const mapRef = createMapRef(2);
    const { result } = renderHook(() => useGlobeAnimation(mapRef, { maxSpinZoom: 3 }));

    act(() => result.current.startSpinning());
    act(() => result.current.stopSpinning());

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
  });

  it('does not queue animation frames when animation is disabled', () => {
    const mapRef = createMapRef(2);
    const { result } = renderHook(() => useGlobeAnimation(mapRef, { enabled: false, maxSpinZoom: 3 }));

    act(() => result.current.startSpinning());

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it('stops spinning on its own after maxSpinDurationMs', () => {
    const mapRef = createMapRef(2);
    const { result } = renderHook(() =>
      useGlobeAnimation(mapRef, { maxSpinZoom: 3, maxSpinDurationMs: 30_000 }),
    );

    act(() => result.current.startSpinning());
    expect(requestAnimationFrameMock).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(30_000));

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(1);
  });

  it('re-arms the spin duration window when spinning resumes after interaction', () => {
    const mapRef = createMapRef(2);
    const { result } = renderHook(() =>
      useGlobeAnimation(mapRef, { maxSpinZoom: 3, maxSpinDurationMs: 30_000 }),
    );

    act(() => result.current.startSpinning());
    act(() => vi.advanceTimersByTime(30_000));
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(1);

    // User interacts, then lets go: spin resumes after the 3s inactivity delay
    act(() => result.current.onUserInteractionStart());
    act(() => result.current.onUserInteractionEnd());
    requestAnimationFrameMock.mockClear();
    act(() => vi.advanceTimersByTime(3000));
    expect(requestAnimationFrameMock).toHaveBeenCalled();

    // ...and stops again after a fresh full duration window
    act(() => vi.advanceTimersByTime(30_000));
    expect(cancelAnimationFrameMock).toHaveBeenCalledTimes(2);
  });

  it('cancels pending resume work when animation becomes disabled', () => {
    const mapRef = createMapRef(2);
    const { result, rerender } = renderHook(
      ({ enabled }) => useGlobeAnimation(mapRef, { enabled, maxSpinZoom: 3 }),
      { initialProps: { enabled: true } },
    );

    act(() => result.current.onUserInteractionEnd());
    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(3000));

    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });
});
