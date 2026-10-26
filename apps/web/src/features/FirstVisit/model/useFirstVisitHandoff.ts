import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';

/** The two-path screen reveals the app only after an explicit action. */
export function useFirstVisitHandoff({ surfaceRef }: { surfaceRef: RefObject<HTMLElement | null> }) {
  const frameRef = useRef<number | null>(null);
  const { prefersReducedMotion } = useViewportCapabilities();
  const cancel = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);
  const rest = useCallback(() => {
    cancel();
    surfaceRef.current?.style.setProperty('--first-visit-progress', '0');
  }, [cancel, surfaceRef]);
  const reveal = useCallback((onDone: () => void) => {
    cancel();
    if (prefersReducedMotion) {
      surfaceRef.current?.style.setProperty('--first-visit-progress', '1');
      onDone();
      return;
    }
    let startedAt: number | null = null;
    const step = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, (now - startedAt) / 440);
      surfaceRef.current?.style.setProperty('--first-visit-progress', String(1 - (1 - progress) ** 2));
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
      else { frameRef.current = null; onDone(); }
    };
    frameRef.current = requestAnimationFrame(step);
  }, [cancel, prefersReducedMotion, surfaceRef]);
  useEffect(() => cancel, [cancel]);
  return { reveal, rest };
}
