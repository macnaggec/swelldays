import { useCallback, useRef, useState } from 'react';

/**
 * Tracks the content-box width (px) of an element via ResizeObserver.
 *
 * Returns `[width, ref]`: attach `ref` — a callback ref — to the element to
 * measure. Width is 0 until the first measurement lands. The measured width, not
 * viewport or mirrored panel-width arithmetic, is the source of truth for gallery
 * columns.
 *
 * The callback ref attaches the observer at the moment the node mounts, so an
 * element that appears after the first render — e.g. a gallery revealed once its
 * loading guard clears — is measured as soon as it exists. A RefObject effect
 * would run once against a null ref and never re-observe the later node, leaving
 * the width stuck at 0.
 */
export function useMeasuredWidth(): readonly [number, (node: HTMLElement | null) => void] {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();

    if (!node) {
      observerRef.current = null;
      return;
    }

    const applyWidth = (nextWidth: number) => {
      const rounded = Math.round(nextWidth);
      setWidth((current) => (current === rounded ? current : rounded));
    };

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.getBoundingClientRect().width;
      applyWidth(nextWidth);
    });

    observer.observe(node);
    observerRef.current = observer;
    applyWidth(node.getBoundingClientRect().width);
  }, []);

  return [width, ref] as const;
}
