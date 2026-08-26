import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { getViewportInnerSize } from 'shared/model/viewportMetrics';

/**
 * Half the travel decides it: less returns to the introduction, more goes
 * through. Nothing in between is a resting place.
 */
const COMMIT_THRESHOLD = 0.5;
/**
 * A trackpad never reports that the fingers lifted, so a pause between wheel
 * events stands in for the release. It must outlast the gaps inside a slow
 * two-finger drag, or the handoff commits while the fingers are still down.
 */
const WHEEL_IDLE_MS = 200;
/** Slop before the map starts following, so a tap cannot nudge it. */
const TOUCH_SLOP_PX = 10;
const LINE_HEIGHT_PX = 16;

const SETTLE_BASE_MS = 260;
const SETTLE_SPAN_MS = 460;

const clampProgress = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The map tracks the finger one to one, so a full screen height of travel is a
 * full handoff and half a screen is the halfway point in both senses.
 */
const travelDistance = () => getViewportInnerSize().heightPx;

interface FirstVisitHandoffOptions {
  /** The overlay whose progress custom property the gesture writes. */
  surfaceRef: RefObject<HTMLElement | null>;
  /** Whether the introduction is on screen and should answer gestures. */
  isActive: boolean;
  /** Called once the visitor has committed to entering. */
  onCommit: () => void;
}

export interface FirstVisitHandoff {
  onWheel: (event: React.WheelEvent<HTMLElement>) => void;
  onTouchStart: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: () => void;
  /** Runs the reveal to completion, then calls back. Used once the map is ready. */
  reveal: (onDone: () => void) => void;
  /** Returns the introduction to rest, e.g. while the map is still loading. */
  rest: () => void;
}

/**
 * Drives the drag that hands the screen over from the introduction to the map.
 *
 * The gesture is interruptible: while the finger is down the map tracks it in
 * both directions, and only the release decides. Progress is written straight
 * to a custom property rather than through React state, because it changes
 * every frame and no other part of the tree needs to know about it.
 */
export function useFirstVisitHandoff({
  surfaceRef,
  isActive,
  onCommit,
}: FirstVisitHandoffOptions): FirstVisitHandoff {
  const progressRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const touchStartRef = useRef<number | null>(null);
  const engagedRef = useRef(false);
  /**
   * A decision is playing out. A trackpad keeps sending wheel events long after
   * the fingers lift, and letting that momentum reopen the drag is what could
   * leave the introduction parked half way off the screen.
   */
  const settlingRef = useRef(false);

  const { prefersReducedMotion } = useViewportCapabilities();

  const write = useCallback((progress: number) => {
    progressRef.current = progress;
    surfaceRef.current?.style.setProperty(
      '--first-visit-progress',
      String(progress),
    );
  }, [surfaceRef]);

  const cancelSettle = useCallback(() => {
    if (frameRef.current === null) return;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const settle = useCallback((target: number, onDone?: () => void) => {
    cancelSettle();
    settlingRef.current = true;

    const from = progressRef.current;
    const span = target - from;

    if (prefersReducedMotion || Math.abs(span) < 0.001) {
      write(target);
      settlingRef.current = false;
      onDone?.();
      return;
    }

    const duration = SETTLE_BASE_MS + Math.abs(span) * SETTLE_SPAN_MS;
    let startedAt: number | null = null;

    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const elapsed = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - elapsed) ** 3;
      write(from + span * eased);

      if (elapsed < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }

      frameRef.current = null;
      write(target);
      settlingRef.current = false;
      onDone?.();
    };

    frameRef.current = requestAnimationFrame(step);
  }, [cancelSettle, prefersReducedMotion, write]);

  /* Past halfway the handoff completes; short of it the introduction returns. */
  const release = useCallback(() => {
    if (progressRef.current >= COMMIT_THRESHOLD) {
      /* The reveal itself waits on the map, so hold the lock across that gap. */
      settlingRef.current = true;
      onCommit();
      return;
    }
    settle(0);
  }, [onCommit, settle]);

  const clearWheelTimer = useCallback(() => {
    if (wheelTimerRef.current === null) return;
    clearTimeout(wheelTimerRef.current);
    wheelTimerRef.current = null;
  }, []);

  const onWheel = useCallback((event: React.WheelEvent<HTMLElement>) => {
    if (!isActive || settlingRef.current) return;
    cancelSettle();

    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= LINE_HEIGHT_PX;
    else if (event.deltaMode === 2) delta *= getViewportInnerSize().heightPx;

    write(clampProgress(progressRef.current + delta / travelDistance()));

    clearWheelTimer();
    wheelTimerRef.current = setTimeout(release, WHEEL_IDLE_MS);
  }, [cancelSettle, clearWheelTimer, isActive, release, write]);

  const onTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    if (!isActive || !touch) {
      touchStartRef.current = null;
      return;
    }

    /* A fresh finger outranks a settle already in flight. */
    cancelSettle();
    settlingRef.current = false;
    touchStartRef.current = touch.clientY;
    engagedRef.current = false;
  }, [cancelSettle, isActive]);

  const onTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const touch = event.touches[0];
    const startY = touchStartRef.current;
    if (startY === null || !touch) return;

    let moved = startY - touch.clientY;

    if (!engagedRef.current) {
      if (Math.abs(moved) < TOUCH_SLOP_PX) return;
      engagedRef.current = true;
      touchStartRef.current = touch.clientY + (moved > 0 ? TOUCH_SLOP_PX : -TOUCH_SLOP_PX);
      moved = touchStartRef.current - touch.clientY;
    }

    write(clampProgress(moved / travelDistance()));
  }, [write]);

  const onTouchEnd = useCallback(() => {
    if (touchStartRef.current === null) return;
    touchStartRef.current = null;

    /* A lift that never passed the slop is a tap, not an abandoned drag. */
    if (!engagedRef.current) return;

    engagedRef.current = false;
    release();
  }, [release]);

  const reveal = useCallback((onDone: () => void) => {
    clearWheelTimer();
    settle(1, onDone);
  }, [clearWheelTimer, settle]);

  const rest = useCallback(() => {
    clearWheelTimer();
    settle(0);
  }, [clearWheelTimer, settle]);

  useEffect(() => () => {
    cancelSettle();
    clearWheelTimer();
  }, [cancelSettle, clearWheelTimer]);

  return { onWheel, onTouchStart, onTouchMove, onTouchEnd, reveal, rest };
}
