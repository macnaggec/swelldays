import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import { materialClasses } from 'shared/ui/design-system';
import { publishDrawerGeometry, publishDrawerMotion } from './geometry';
import { DRAWER_SHELL_TRANSITION } from './motion';
import { PanelSettledWidthContext } from './panelSettledWidth';
import styles from './DrawerShell.module.css';

export type DrawerShellPresentation = Exclude<
  AppShellLayoutPolicy['drawer']['presentation'],
  'hidden'
>;
export type DrawerShellState = Extract<
  AppShellLayoutPolicy['drawer']['state'],
  'compact' | 'expanded'
>;
export type DrawerShellModality = Exclude<
  AppShellLayoutPolicy['drawer']['modality'],
  'none'
>;

interface DrawerShellProps {
  presentation: DrawerShellPresentation;
  state: DrawerShellState;
  modality: DrawerShellModality;
  ariaLabel?: string;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

/**
 * Band-transition continuity contract (F12d): the drawer surface and its children keep
 * their element identity across every non-hidden presentation/state/modality change, so
 * focus, scroll position, and in-progress component state survive a capability-band
 * presentation swap. Presentation changes are attribute/animation changes only — never
 * a different element tree.
 */
export function DrawerShell({
  presentation,
  state,
  modality,
  ariaLabel = 'Content drawer',
  restoreFocusRef,
  children,
}: DrawerShellProps) {
  const surfaceRef = useRef<HTMLElement>(null);

  const latestRestoreFocusRef = useRef(restoreFocusRef);
  useEffect(() => {
    latestRestoreFocusRef.current = restoreFocusRef;
  });

  const [transitioning, setTransitioning] = useState(false);
  const [renderedState, setRenderedState] = useState(state);
  if (renderedState !== state) {
    setRenderedState(state);
    setTransitioning(true);
  }

  // The surface's width the last time it was standing still, and which state that was.
  // Every destination is an exact multiple of it, because the two states are pure
  // fractions of the viewport with nothing added.
  const [resting, setResting] = useState({ state, width: 0 });

  // Read by the measurement loop, which is mounted once and must not be torn down and
  // rebuilt whenever either value changes. Synced before paint, so the loop's next
  // frame already knows the surface has started moving.
  const transitioningRef = useRef(false);
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    transitioningRef.current = transitioning;
    stateRef.current = state;
    publishDrawerMotion(transitioning);
  }, [transitioning, state]);

  useEffect(() => () => {
    const focusTarget = latestRestoreFocusRef.current?.current;
    if (!focusTarget?.isConnected) return;
    // Reclaim focus only when the drawer held it: removing the surface drops focus to
    // body. Focus resting on another live control must never be stolen (F12d).
    const activeElement = document.activeElement;
    if (activeElement && activeElement !== document.body) return;
    focusTarget.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let pendingFrame: number | null = null;
    const measure = () => {
      pendingFrame = null;
      const bounds = surface.getBoundingClientRect();
      publishDrawerGeometry(bounds);
      // Only a measurement taken while standing still describes a settled width; the
      // ones taken mid-toggle are the animation passing through. This also picks up a
      // browser-window resize, which changes the settled width without any toggle.
      if (transitioningRef.current) return;
      setResting((current) => (
        current.width === bounds.width && current.state === stateRef.current
          ? current
          : { state: stateRef.current, width: bounds.width }
      ));
    };
    const scheduleMeasurement = () => {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasurement);

    observer.observe(surface);
    scheduleMeasurement();

    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      publishDrawerGeometry(null);
      publishDrawerMotion(false);
    };
  }, []);

  const isModal = modality === 'modal';

  // Published to panel content so it can lay out at the destination width rather than
  // riding the surface's per-frame width animation. `transitioning` brackets exactly
  // the span in which the two disagree.
  // `transitioning` must turn true in the same render that changes `state`, not a frame
  // later from onAnimationStart: for that one frame consumers would otherwise see the
  // destination scale while still trusting a measurement taken at the old width, and
  // size themselves from the two mixed together.
  const destinationWidth = resting.width > 0
    ? resting.width * (PANEL_WIDTH_VW[state] / PANEL_WIDTH_VW[resting.state])
    : 0;

  const settledWidth = useMemo(
    () => ({ destinationWidth, transitioning }),
    [destinationWidth, transitioning],
  );

  return (
    <motion.aside
      ref={surfaceRef}
      aria-label={ariaLabel}
      aria-modal={isModal || undefined}
      role={isModal ? 'dialog' : undefined}
      className={`${styles.surface} ${materialClasses.panel}`}
      data-drawer-presentation={presentation}
      data-drawer-state={state}
      data-drawer-modality={modality}
      initial={false}
      animate={{ width: state === 'expanded' ? `${PANEL_WIDTH_VW.expanded}vw` : `${PANEL_WIDTH_VW.compact}vw` }}
      transition={{ width: DRAWER_SHELL_TRANSITION }}
      onAnimationComplete={() => {
        transitioningRef.current = false;
        setTransitioning(false);
      }}
    >
      <PanelSettledWidthContext.Provider value={settledWidth}>
        {children}
      </PanelSettledWidthContext.Provider>
    </motion.aside>
  );
}
