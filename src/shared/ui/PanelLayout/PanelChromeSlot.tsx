import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { DRAWER_SHELL_TRANSITION } from 'shared/ui/DrawerShell';
import { usePanelSettledWidth } from 'shared/ui/DrawerShell/panelSettledWidth';

interface PanelChromeSlotProps {
  className?: string;
  children: ReactNode;
}

/**
 * A piece of panel chrome that glides to its new place when the panel changes width.
 *
 * Chrome that is centred or end-aligned — the feed/gallery switcher above all — sits at
 * a position derived from the panel's width, so when the panel takes its destination
 * width the item is simply somewhere else on the next frame. Correct, and it reads as a
 * jump. Moving it is a change of position only: it does not resize, and neither does the
 * row it sits in, so nothing re-flows on the way.
 *
 * Its own component rather than markup inside the panel widget for two reasons: motion
 * belongs to shared/ui rather than to the widget (`check:style-boundaries` enforces
 * that), and it must re-render when the width changes or the animation cannot happen —
 * a component whose own output is unchanged is skipped by React and never re-measures,
 * which is exactly how the item ends up jumping instead.
 */
export function PanelChromeSlot({ className, children }: PanelChromeSlotProps) {
  const settled = usePanelSettledWidth();

  return (
    <motion.div
      className={className}
      layout="position"
      layoutDependency={settled?.destinationWidth ?? 0}
      transition={{ layout: DRAWER_SHELL_TRANSITION }}
    >
      {children}
    </motion.div>
  );
}
