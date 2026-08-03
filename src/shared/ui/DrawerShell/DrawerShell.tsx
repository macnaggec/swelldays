import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { animate as animateSurface, motion, useDragControls, type DragHandler } from 'framer-motion';
import { FocusTrap } from '@mantine/core';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import { materialClasses } from 'shared/ui/design-system';
import {
  publishDrawerDragging,
  publishDrawerGeometry,
  publishDrawerMotion,
  publishDrawerTargetGeometry,
  type DrawerGeometry,
} from './geometry';
import { deriveKeyboardInsetPx } from './keyboardInset';
import { deriveDrawerSurfaceTransition, DRAWER_SHELL_TRANSITION } from './motion';
import { PanelSettledWidthContext } from './panelSettledWidth';
import {
  nearestSheetSnap,
  resolveSheetSnapHeights,
  SHEET_PEEK_HEIGHT_PX,
  type SheetSnap,
} from './sheetSnapPolicy';
import {
  SheetContentScrollContext,
  SheetScrollOwnerContext,
} from './sheetScrollCoupling';
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
  /** Invoked when Escape is pressed while modal and open. Ignored otherwise. */
  onEscape?: () => void;
  children?: ReactNode;
}

interface DrawerShellPanelProps extends DrawerShellBaseProps {
  presentation: DrawerShellPanelPresentation;
  state: DrawerShellState;
  open?: boolean;
}

interface DrawerShellSheetProps extends DrawerShellBaseProps {
  presentation: 'bottomSheet';
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
}

export type DrawerShellProps = DrawerShellPanelProps | DrawerShellSheetProps;

// Small because dragConstraints already bounds the travel between full and peek; this
// only softens the stop at either end rather than allowing real overshoot.
const SHEET_DRAG_ELASTIC = 0.08;
const SHORT_SIDE_OVERLAY_WIDTH_VW = 45;
const FULL_SCREEN_WIDTH_VW = 100;

/**
 * Band-transition continuity contract (F12d): the drawer surface and its children keep
 * their element identity across every non-hidden presentation/state/modality change, so
 * focus, scroll position, and in-progress component state survive a capability-band
 * presentation swap. Presentation changes are attribute/animation changes only — never
 * a different element tree.
 */
export function DrawerShell(props: DrawerShellProps) {
  const { modality, ariaLabel = 'Content drawer', restoreFocusRef, onEscape, children } = props;
  const snap = props.presentation === 'bottomSheet' ? props.snap : undefined;
  const onSnapChange = props.presentation === 'bottomSheet' ? props.onSnapChange : undefined;
  const panelOpen = props.presentation === 'bottomSheet' ? true : (props.open ?? true);
  const positionKey: DrawerShellState | SheetSnap =
    props.presentation === 'bottomSheet' ? props.snap : props.state;
  const transitionKey = props.presentation === 'bottomSheet'
    ? `bottomSheet:${props.snap}`
    : `${props.presentation}:${props.state}:${panelOpen ? 'open' : 'closed'}`;

  const { prefersReducedMotion } = useViewportCapabilities();
  const {
    layoutViewportWidthPx: viewportWidthPx,
    layoutViewportHeightPx: viewportHeightPx,
    visualViewportHeightPx,
    visualViewportOffsetTopPx,
  } = useViewportMetrics();
  const keyboardInsetPx = deriveKeyboardInsetPx({
    layoutViewportHeightPx: viewportHeightPx,
    visualViewportHeightPx,
    visualViewportOffsetTopPx,
  });
  const heights = useMemo(
    () => resolveSheetSnapHeights({ viewportHeightPx, peekHeightPx: SHEET_PEEK_HEIGHT_PX }),
    [viewportHeightPx],
  );
  const targetSheetHeightPx = snap ? heights[snap] : null;
  const targetPanelWidthVw = props.presentation === 'persistent'
    ? PANEL_WIDTH_VW[props.state]
    : props.presentation === 'fullScreen'
      ? FULL_SCREEN_WIDTH_VW
      : SHORT_SIDE_OVERLAY_WIDTH_VW;
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
  const [renderedTransitionKey, setRenderedTransitionKey] = useState(transitionKey);
  if (renderedTransitionKey !== transitionKey) {
    setRenderedTransitionKey(transitionKey);
    setTransitioning(true);
  }

  // The surface's width the last time it was standing still, and which position it had
  // settled at. Persistent-panel destinations are exact multiples of it because their
  // two states are pure viewport fractions. The short side overlay instead has one
  // DrawerShell-owned viewport fraction plus its closed zero-width state. The sheet is
  // full width at every snap, so its resting measurement is already the destination.
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

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let target: DrawerGeometry;
    if (props.presentation === 'bottomSheet') {
      const targetHeight = targetSheetHeightPx;
      if (targetHeight === null) return;
      target = {
        left: 0,
        top: viewportHeightPx - targetHeight,
        right: viewportWidthPx,
        bottom: viewportHeightPx,
        width: viewportWidthPx,
        height: targetHeight,
      };
    } else {
      const targetWidth = panelOpen
        ? viewportWidthPx * (targetPanelWidthVw / 100)
        : 0;
      target = {
        left: viewportWidthPx - targetWidth,
        top: 0,
        right: viewportWidthPx,
        bottom: viewportHeightPx,
        width: targetWidth,
        height: viewportHeightPx,
      };
    }

    publishDrawerTargetGeometry(target);
  }, [
    panelOpen,
    props.presentation,
    targetPanelWidthVw,
    targetSheetHeightPx,
    viewportHeightPx,
    viewportWidthPx,
  ]);

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
      publishDrawerTargetGeometry(null);
      publishDrawerMotion(false);
      publishDrawerDragging(false);
    };
  }, []);

  const isModal = modality === 'modal';

  useEffect(() => {
    if (!isModal || !onEscape || !panelOpen) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      onEscape();
    };
    surface.addEventListener('keydown', handleKeyDown);
    return () => surface.removeEventListener('keydown', handleKeyDown);
  }, [isModal, onEscape, panelOpen]);

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
    : props.presentation === 'sideOverlay'
      ? panelOpen ? viewportWidthPx * (SHORT_SIDE_OVERLAY_WIDTH_VW / 100) : 0
      : props.presentation === 'fullScreen'
        ? panelOpen ? viewportWidthPx : 0
        : resting.width > 0 && previousPanelVw !== null
          ? resting.width * (PANEL_WIDTH_VW[props.state] / previousPanelVw)
          : 0;

  const settledWidth = useMemo(
    () => ({
      destinationWidth,
      open: panelOpen,
      // A sheet is full-width at every snap, so its content never rides a mid-toggle
      // width; only the panel's width animation can leave the two temporarily apart.
      transitioning: props.presentation === 'bottomSheet' ? false : transitioning,
    }),
    [destinationWidth, panelOpen, transitioning, props.presentation],
  );

  // The panel scroll owner the sheet arbitrates with (step 8): registered by PanelLayout
  // through SheetScrollOwnerContext, never queried by attribute.
  const removeScrollOwnerListenerRef = useRef<() => void>(() => { });
  const [contentScrolledFromTop, setContentScrolledFromTop] = useState(false);

  const registerScrollOwner = useCallback((element: HTMLElement | null) => {
    removeScrollOwnerListenerRef.current();
    removeScrollOwnerListenerRef.current = () => { };
    if (!element) return;

    if (snap !== undefined && snap !== 'full') element.scrollTop = 0;
    const handleScroll = () => {
      setContentScrolledFromTop(snap === 'full' && element.scrollTop > 0);
    };
    handleScroll();
    element.addEventListener('scroll', handleScroll);
    removeScrollOwnerListenerRef.current = () => {
      element.removeEventListener('scroll', handleScroll);
    };
  }, [snap]);

  const handleSheetDrag: DragHandler = () => {
    const surface = surfaceRef.current;
    if (!surface) return;
    publishDrawerDragging(true);
    publishDrawerGeometry(surface.getBoundingClientRect());
  };

  const handleSheetDragEnd: DragHandler = (_event, info) => {
    publishDrawerDragging(false);
    const surface = surfaceRef.current;
    if (!surface || snap === undefined || !onSnapChange) return;
    const heightPx = viewportHeightPx - surface.getBoundingClientRect().top;
    const nextSnap = nearestSheetSnap({ heightPx, velocityPx: info.velocity.y, heights });
    if (nextSnap === snap) {
      // The resolved snap did not change, so nothing re-renders and the declarative
      // `animate` prop below never recomputes its target. Settle explicitly instead of
      // leaving the sheet wherever a slow, deliberate drag happened to release it.
      animateSurface(surface, { y: viewportHeightPx - heights[nextSnap] }, prefersReducedMotion ? { duration: 0 } : DRAWER_SHELL_TRANSITION);
      return;
    }
    onSnapChange(nextSnap);
  };

  // Both presentations name *both* properties, even though each only animates one of
  // them. An animated value is written to the element as an inline style and stays there;
  // a target that mentioned only its own property would leave the other presentation's
  // last value in place, outranking the stylesheet. Live-resizing a window from wide to
  // compact would then show the sheet still wearing the panel's 25vw width, and only a
  // reload — which mounts straight into the sheet — would look right.
  const animate = props.presentation === 'bottomSheet'
    ? { y: viewportHeightPx - heights[props.snap], width: '100%' }
    : {
      y: 0,
      width: props.presentation === 'sideOverlay'
        ? panelOpen
          ? `${SHORT_SIDE_OVERLAY_WIDTH_VW}vw`
          : '0vw'
        : props.presentation === 'fullScreen'
          ? panelOpen
            ? `${FULL_SCREEN_WIDTH_VW}vw`
            : '0vw'
          : props.state === 'expanded' ? `${PANEL_WIDTH_VW.expanded}vw` : `${PANEL_WIDTH_VW.compact}vw`,
    };
  // The property a presentation does not animate is corrected instantly: a band crossing
  // is a presentation swap, not a movement the user should watch.
  const transition = deriveDrawerSurfaceTransition({
    isBottomSheet: props.presentation === 'bottomSheet',
    prefersReducedMotion,
  });

  return (
    <FocusTrap active={isModal && panelOpen} innerRef={surfaceRef}>
      <motion.aside
        aria-label={ariaLabel}
        aria-modal={isModal || undefined}
        aria-hidden={panelOpen ? undefined : true}
        inert={!panelOpen}
        role={isModal ? 'dialog' : undefined}
        className={`${styles.surface} ${materialClasses.panel}`}
        data-drawer-presentation={props.presentation}
        data-drawer-state={props.presentation === 'bottomSheet' ? undefined : props.state}
        data-drawer-snap={props.presentation === 'bottomSheet' ? props.snap : undefined}
        data-drawer-modality={modality}
        initial={false}
        style={{ '--wa-keyboard-inset-bottom': `${keyboardInsetPx}px` } as CSSProperties}
        animate={animate}
        transition={transition}
        drag={props.presentation === 'bottomSheet' ? 'y' : false}
        dragControls={props.presentation === 'bottomSheet' ? dragControls : undefined}
        dragListener={props.presentation === 'bottomSheet' ? !contentScrolledFromTop : undefined}
        dragConstraints={props.presentation === 'bottomSheet' ? dragConstraints : undefined}
        dragElastic={props.presentation === 'bottomSheet' ? SHEET_DRAG_ELASTIC : undefined}
        dragMomentum={false}
        onDrag={props.presentation === 'bottomSheet' ? handleSheetDrag : undefined}
        onDragEnd={props.presentation === 'bottomSheet' ? handleSheetDragEnd : undefined}
        onAnimationComplete={() => {
          const bounds = surfaceRef.current?.getBoundingClientRect();
          if (bounds) publishDrawerGeometry(bounds);
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
          * These providers are mounted in every presentation on purpose. Wrapping the
          * children only in the sheet branch would change the element type at this
          * position on a band crossing, so React would unmount and rebuild the whole
          * panel subtree — losing the draft text, focus, and scroll position F12d
          * exists to preserve. Outside a sheet the registration is inert: the
          * arbitration effect below returns early when there is no snap.
          */}
        <PanelSettledWidthContext.Provider value={settledWidth}>
          <SheetScrollOwnerContext.Provider value={registerScrollOwner}>
            <SheetContentScrollContext.Provider
              value={props.presentation === 'bottomSheet' ? props.snap === 'full' : true}
            >
              {children}
            </SheetContentScrollContext.Provider>
          </SheetScrollOwnerContext.Provider>
        </PanelSettledWidthContext.Provider>
      </motion.aside>
    </FocusTrap>
  );
}
