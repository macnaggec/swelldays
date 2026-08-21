import { useCallback, useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl';

interface UseGlobeAnimationOptions {
  /** Rotation speed in degrees per second */
  spinSpeed?: number;
  /** Whether animation should be running */
  enabled?: boolean;
  /** Maximum zoom level at which spinning is allowed (default: 3) */
  maxSpinZoom?: number;
  /** How long a spin runs before stopping on its own (default: 30s) — every frame re-renders the whole map, so an unbounded spin keeps the GPU busy indefinitely */
  maxSpinDurationMs?: number;
}

/**
 * Hook to manage slow spinning globe animation
 * Pauses on user interaction and resumes after inactivity
 * Only spins when zoomed out beyond maxSpinZoom threshold
 * Each spin stops on its own after maxSpinDurationMs; the next user interaction re-arms it
 */
export function useGlobeAnimation(
  mapRef: React.RefObject<MapRef | null>,
  options: UseGlobeAnimationOptions = {}
) {
  const {
    spinSpeed = 0.5,
    enabled = true,
    maxSpinZoom = 3,
    maxSpinDurationMs = 30_000,
  } = options;

  const isSpinningRef = useRef(false);
  const userInteractingRef = useRef(false);
  const spinTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const spinDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const spinGlobeRef = useRef<() => void>(() => undefined);

  const cancelQueuedFrame = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearResumeTimeout = useCallback(() => {
    if (spinTimeoutRef.current) {
      clearTimeout(spinTimeoutRef.current);
      spinTimeoutRef.current = null;
    }
  }, []);

  const clearSpinDurationTimeout = useCallback(() => {
    if (spinDurationTimeoutRef.current) {
      clearTimeout(spinDurationTimeoutRef.current);
      spinDurationTimeoutRef.current = null;
    }
  }, []);

  const spinGlobe = useCallback(() => {
    animationFrameRef.current = null;

    // Immediate check before any frame logic
    if (
      userInteractingRef.current ||
      !isSpinningRef.current ||
      !enabled ||
      !mapRef.current
    ) {
      isSpinningRef.current = false;
      return;
    }

    const map = mapRef.current.getMap();
    if (!map) return;

    // Check if map is currently moving/zooming/rotating by user
    if (map.isMoving() && userInteractingRef.current) {
      isSpinningRef.current = false;
      return;
    }

    const currentZoom = map.getZoom();

    // Only spin when zoomed out beyond threshold
    if (currentZoom > maxSpinZoom) {
      isSpinningRef.current = false;
      return;
    }

    const center = map.getCenter();
    center.lng -= spinSpeed / 60;
    map.setCenter(center);

    animationFrameRef.current = requestAnimationFrame(() => spinGlobeRef.current());
  }, [enabled, mapRef, maxSpinZoom, spinSpeed]);

  useEffect(() => {
    spinGlobeRef.current = spinGlobe;
  }, [spinGlobe]);

  const stopSpinning = useCallback(() => {
    isSpinningRef.current = false;
    cancelQueuedFrame();
    clearSpinDurationTimeout();
  }, [cancelQueuedFrame, clearSpinDurationTimeout]);

  const startSpinning = useCallback(() => {
    if (!enabled) return;
    // Don't start if user is interacting
    if (userInteractingRef.current) return;
    if (animationFrameRef.current !== null) return;

    isSpinningRef.current = true;
    clearSpinDurationTimeout();
    spinDurationTimeoutRef.current = setTimeout(() => {
      spinDurationTimeoutRef.current = null;
      stopSpinning();
    }, maxSpinDurationMs);
    spinGlobe();
  }, [clearSpinDurationTimeout, enabled, maxSpinDurationMs, spinGlobe, stopSpinning]);

  const onUserInteractionStart = useCallback(() => {
    userInteractingRef.current = true;
    stopSpinning();
    clearResumeTimeout();
  }, [clearResumeTimeout, stopSpinning]);

  const onUserInteractionEnd = useCallback(() => {
    userInteractingRef.current = false;
    clearResumeTimeout();

    // Resume spinning after 3 seconds of inactivity, only if zoomed out
    spinTimeoutRef.current = setTimeout(() => {
      if (enabled && mapRef.current) {
        const currentZoom = mapRef.current.getMap().getZoom();
        if (currentZoom <= maxSpinZoom) {
          startSpinning();
        }
      }
    }, 3000);
  }, [
    clearResumeTimeout,
    enabled,
    mapRef,
    maxSpinZoom,
    startSpinning,
  ]);

  useEffect(() => {
    if (!enabled) {
      stopSpinning();
      clearResumeTimeout();
    }
  }, [clearResumeTimeout, enabled, stopSpinning]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      clearResumeTimeout();
      clearSpinDurationTimeout();
      cancelQueuedFrame();
    };
  }, [cancelQueuedFrame, clearResumeTimeout, clearSpinDurationTimeout]);

  return {
    startSpinning,
    stopSpinning,
    onUserInteractionStart,
    onUserInteractionEnd,
  };
}
