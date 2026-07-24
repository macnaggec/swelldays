import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Tracks the content-box width (px) of the referenced element via ResizeObserver.
 * Returns 0 until the first measurement lands. The measured width — not viewport
 * or mirrored panel-width arithmetic — is the source of truth for gallery columns.
 */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const applyWidth = (nextWidth: number) => {
      const rounded = Math.round(nextWidth);
      setWidth((current) => (current === rounded ? current : rounded));
    };

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? element.getBoundingClientRect().width;
      applyWidth(nextWidth);
    });

    observer.observe(element);
    applyWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, [ref]);

  return width;
}
