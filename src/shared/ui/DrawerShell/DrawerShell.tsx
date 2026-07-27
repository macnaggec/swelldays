import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion, useDragControls, type DragHandler } from 'framer-motion';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import { materialClasses } from 'shared/ui/design-system';
import { publishDrawerGeometry, publishDrawerMotion } from './geometry';
import { DRAWER_SHELL_TRANSITION } from './motion';
import { PanelSettledWidthContext } from './panelSettledWidth';
import {
  nearestSheetSnap,
  nextSheetSnapUp,
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
  type SheetSnap,
} from './sheetSnapPolicy';
import { SheetScrollOwnerContext } from './sheetScrollCoupling';
import styles from './DrawerShell.module.css';

export type DrawerShellPresentation = Exclude<
  AppShellLayoutPolicy['drawer']['presentation'],
  'hidden'
>;
export type DrawerShellPanelPresentation = Exclude<DrawerShellPresentation, 'bottomSheet'>;
export type DrawerShellState = Extract<
  AppShellLayoutPolicy['drawer']['state'],
  'compact' | 'expanded'
>;
export type DrawerShellModality = Exclude<
  AppShellLayoutPolicy['drawer']['modality'],
  'none'
>;

interface DrawerShellBaseProps {
  modality: DrawerShellModality;
  ariaLabel?: string;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

interface DrawerShellPanelProps extends DrawerShellBaseProps {
  presentation: DrawerShellPanelPresentation;
  state: DrawerShellState;
}

interface DrawerShellSheetProps extends DrawerShellBaseProps {
  presentation: 'bottomSheet';
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
}

export type DrawerShellProps = DrawerShellPanelProps | DrawerShellSheetProps;

// A deliberate pull past this reads as "the user scrolled the list", promoting the
// sheet; settling sub-pixel jitter at the top must not.
const SHEET_SCROLL_PROMOTE_THRESHOLD_PX = 4;

// Small because dragConstraints already bounds the travel between full and peek; this
// only softens the stop at either end rather than allowing real overshoot.
const SHEET_DRAG_ELASTIC = 0.08;

/**
 * Band-transition continuity contract (F12d): the drawer surface and its children keep
 * their element identity across every non-hidden presentation/state/modality change, so
 * focus, scroll position, and in-progress component state survive a capability-band
 * presentation swap. Presentation changes are attribute/animation changes only — never
 * a different element tree.
 */
export function DrawerShell(props: DrawerShellProps) {
  const { modality, ariaLabel = 'Content drawer', restoreFocusRef, children } = props;
  const snap = props.presentation === 'bottomSheet' ? props.snap : undefined;
  const onSnapChange = props.presentation === 'bottomSheet' ? props.onSnapChange : undefined;
  const positionKey: DrawerShellState | SheetSnap =
    props.presentation === 'bottomSheet' ? props.snap : props.state;

  const { prefersReducedMotion } = useViewportCapabilities();
  const { layoutViewportHeightPx: viewportHeightPx } = useViewportMetrics();
  const heights = useMemo(
    () => resolveSheetSnapHeights({ viewportHeightPx, peekHeightPx: SHEET_PEEK_HEIGHT_PX }),
    [viewportHeightPx],
  );
  const dragControls = useDragControls();
  const dragConstraints = useMemo(
    () => ({ top: viewportHeightPx - heights.full, bottom: viewportHeightPx - heights.peek }),
    [viewportHeightPx, heights],
  );

  const surfaceRef = useRef<HTMLElement>(null);

  const latestRestoreFocusRef = useRef(restoreFocusRef);
  useEffect(() => {
    latestRestoreFocusRef.current = restoreFocusRef;
  });

  const [transitioning, setTransitioning] = useState(false);
  const [renderedPositionKey, setRenderedPositionKey] = useState(positionKey);
  if (renderedPositionKey !== positionKey) {
    setRenderedPositionKey(positionKey);
    setTransitioning(true);
  }

  // The surface's width the last time it was standing still, and which position it had
  // settled at. For the panel, every destination is an exact multiple of it, because the
  // two states are pure fractions of the viewport with nothing added. For the sheet, the
  // surface is full width at every snap, so this alone is already the destination.
  const [resting, setResting] = useState<{ key: DrawerShellState | SheetSnap; width: number }>({
    key: positionKey,
    width: 0,
  });

  // Read by the measurement loop, which is mounted once and must not be torn down and
  // rebuilt whenever either value changes. Synced before paint, so the loop's next
  // frame already knows the surface has started moving.
  const transitioningRef = useRef(false);
  const positionKeyRef = useRef(positionKey);
  useLayoutEffect(() => {
    transitioningRef.current = transitioning;
    positionKeyRef.current = positionKey;
    publishDrawerMotion(transitioning);
  }, [transitioning, positionKey]);

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
        current.width === bounds.width && current.key === positionKeyRef.current
          ? current
          : { key: positionKeyRef.current, width: bounds.width }
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
  const restingKey = resting.key;
  const previousPanelVw = restingKey === 'expanded' || restingKey === 'compact'
    ? PANEL_WIDTH_VW[restingKey]
    : null;
  const destinationWidth = props.presentation === 'bottomSheet'
    ? resting.width
    : resting.width > 0 && previousPanelVw !== null
      ? resting.width * (PANEL_WIDTH_VW[props.state] / previousPanelVw)
      : 0;

  const settledWidth = useMemo(
    () => ({
      destinationWidth,
      // A sheet is full-width at every snap, so its content never rides a mid-toggle
      // width; only the panel's width animation can leave the two temporarily apart.
      transitioning: props.presentation === 'bottomSheet' ? false : transitioning,
    }),
    [destinationWidth, transitioning, props.presentation],
  );

  // The panel scroll owner the sheet arbitrates with (step 8): registered by PanelLayout
  // through SheetScrollOwnerContext, never queried by attribute.
  const [scrollOwnerElement, setScrollOwnerElement] = useState<HTMLElement | null>(null);
  const [contentScrolledFromTop, setContentScrolledFromTop] = useState(false);

  useEffect(() => {
    if (!scrollOwnerElement || snap === undefined || !onSnapChange) return;
    const activeSnap = snap;
    const changeSnap = onSnapChange;

    const handleScroll = () => {
      setContentScrolledFromTop(scrollOwnerElement.scrollTop > 0);
      if (activeSnap === 'full') return;
      if (scrollOwnerElement.scrollTop <= SHEET_SCROLL_PROMOTE_THRESHOLD_PX) return;
      changeSnap(nextSheetSnapUp(activeSnap));
      scrollOwnerElement.scrollTop = 0;
    };

    scrollOwnerElement.addEventListener('scroll', handleScroll);
    return () => {
      scrollOwnerElement.removeEventListener('scroll', handleScroll);
      setContentScrolledFromTop(false);
    };
  }, [scrollOwnerElement, snap, onSnapChange]);

  const handleSheetDragEnd: DragHandler = (_event, info) => {
    const surface = surfaceRef.current;
    if (!surface || snap === undefined || !onSnapChange) return;
    const heightPx = viewportHeightPx - surface.getBoundingClientRect().top;
    onSnapChange(nearestSheetSnap({ heightPx, velocityPx: info.velocity.y, heights }));
  };

  const animate = props.presentation === 'bottomSheet'
    ? { y: viewportHeightPx - heights[props.snap] }
    : { width: props.state === 'expanded' ? `${PANEL_WIDTH_VW.expanded}vw` : `${PANEL_WIDTH_VW.compact}vw` };
  const transition = props.presentation === 'bottomSheet'
    ? { y: prefersReducedMotion ? { duration: 0 } : DRAWER_SHELL_TRANSITION }
    : { width: DRAWER_SHELL_TRANSITION };

  return (
    <motion.aside
      ref={surfaceRef}
      aria-label={ariaLabel}
      aria-modal={isModal || undefined}
      role={isModal ? 'dialog' : undefined}
      className={`${styles.surface} ${materialClasses.panel}`}
      data-drawer-presentation={props.presentation}
      data-drawer-state={props.presentation === 'bottomSheet' ? undefined : props.state}
      data-drawer-snap={props.presentation === 'bottomSheet' ? props.snap : undefined}
      data-drawer-modality={modality}
      initial={false}
      animate={animate}
      transition={transition}
      drag={props.presentation === 'bottomSheet' ? 'y' : false}
      dragControls={props.presentation === 'bottomSheet' ? dragControls : undefined}
      dragListener={props.presentation === 'bottomSheet' ? !contentScrolledFromTop : undefined}
      dragConstraints={props.presentation === 'bottomSheet' ? dragConstraints : undefined}
      dragElastic={props.presentation === 'bottomSheet' ? SHEET_DRAG_ELASTIC : undefined}
      onDragEnd={props.presentation === 'bottomSheet' ? handleSheetDragEnd : undefined}
      onAnimationComplete={() => {
        transitioningRef.current = false;
        setTransitioning(false);
      }}
    >
      {snap !== undefined && (
        <div
          className={styles.dragHandle}
          data-drawer-sheet-handle
          onPointerDown={(event) => dragControls.start(event)}
        />
      )}
      {/*
        * Both providers are mounted in every presentation on purpose. Wrapping the
        * children only in the sheet branch would change the element type at this
        * position on a band crossing, so React would unmount and rebuild the whole
        * panel subtree — losing the draft text, focus, and scroll position F12d
        * exists to preserve. Outside a sheet the registration is inert: the
        * arbitration effect below returns early when there is no snap.
        */}
      <PanelSettledWidthContext.Provider value={settledWidth}>
        <SheetScrollOwnerContext.Provider value={setScrollOwnerElement}>
          {children}
        </SheetScrollOwnerContext.Provider>
      </PanelSettledWidthContext.Provider>
    </motion.aside>
  );
}
