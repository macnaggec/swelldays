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
import { useNavigationRailGeometry } from 'shared/model/navigationRailGeometry';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { dismissActiveTextEntry } from 'shared/lib/dismissActiveTextEntry';
import {
  PANEL_COMPACT_MIN_WIDTH_PX,
  resolvePanelWidthPx,
} from 'shared/model/panelExpansionStore';
import { materialClasses } from 'shared/ui/design-system';
import {
  publishDrawerDragging,
  publishDrawerGeometry,
  publishDrawerMotion,
  publishDrawerSheetSnap,
  publishDrawerTargetGeometry,
  type DrawerGeometry,
} from './geometry';
import { deriveDrawerSurfaceTransition, DRAWER_SHELL_TRANSITION } from './motion';
import { PanelSettledWidthContext } from './panelSettledWidth';
import {
  nearestSheetSnap,
  resolveBrowseSheetPeekHeightPx,
  resolveHeaderSheetPeekHeightPx,
  resolveSheetSnapHeights,
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
  /** True when this sheet keeps its own header row (back chevron + title) visible at
   *  Peek, unlike Browse's sheet — Peek then needs enough height for that row too. */
  peekIncludesHeader?: boolean;
  /** Snaps this sheet may land on when dragged or flicked. Defaults to all three. */
  availableSnaps?: readonly SheetSnap[];
}

export type DrawerShellProps = DrawerShellPanelProps | DrawerShellSheetProps;

// Small because dragConstraints already bounds the travel between full and peek; this
// only softens the stop at either end rather than allowing real overshoot.
const SHEET_DRAG_ELASTIC = 0.08;
const SHEET_KEYBOARD_DISMISS_DRAG_THRESHOLD_PX = 12;
const SIDE_OVERLAY_WIDTH_VW = 45;
const FULL_SCREEN_WIDTH_VW = 100;

/**
 * The side overlay's own width. Unfloored at short height (the
 * landscape-phone/small-tablet side sheet — unchanged, already-approved
 * geometry, out of scope for this task). At regular height (the tablet
 * side overlay) it reuses the compact persistent panel's own 360px floor
 * (PANEL_COMPACT_MIN_WIDTH_PX): this drawer renders the identical
 * PanelSearchToolbar/FilterPills chrome the persistent panel already
 * guarantees fits at that width, so the floor is the same guarantee, not a
 * second unrelated minimum for the same content.
 */
function resolveSideOverlayWidthPx(viewportWidthPx: number, heightBand: 'short' | 'regular'): number {
  const vwWidthPx = viewportWidthPx * (SIDE_OVERLAY_WIDTH_VW / 100);
  return heightBand === 'regular' ? Math.max(vwWidthPx, PANEL_COMPACT_MIN_WIDTH_PX) : vwWidthPx;
}

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
  const peekIncludesHeader = props.presentation === 'bottomSheet' ? props.peekIncludesHeader : undefined;
  const availableSnaps = props.presentation === 'bottomSheet' ? props.availableSnaps : undefined;
  const isSheetDraggable = props.presentation === 'bottomSheet'
    && (availableSnaps === undefined || availableSnaps.length > 1);
  const panelOpen = props.presentation === 'bottomSheet' ? true : (props.open ?? true);
  const positionKey: DrawerShellState | SheetSnap =
    props.presentation === 'bottomSheet' ? props.snap : props.state;
  const transitionKey = props.presentation === 'bottomSheet'
    ? `bottomSheet:${props.snap}`
    : `${props.presentation}:${props.state}:${panelOpen ? 'open' : 'closed'}`;

  const { prefersReducedMotion, isStandalone, heightBand } = useViewportCapabilities();
  const {
    layoutViewportWidthPx: viewportWidthPx,
    layoutViewportHeightPx: viewportHeightPx,
    safeAreaTopPx,
    safeAreaBottomPx,
  } = useViewportMetrics();

  // A standalone sheet paints through iOS's home-swipe strip but places interactive
  // content above it. A browser tab has no in-app home indicator, so its viewport edge
  // is directly reachable and must not inherit the standalone strip's reserve.
  const sheetBottomInsetPx = isStandalone ? safeAreaBottomPx : 0;
  const heights = useMemo(
    () => resolveSheetSnapHeights({
      viewportHeightPx: viewportHeightPx - safeAreaTopPx - sheetBottomInsetPx,
      peekHeightPx: peekIncludesHeader
        ? resolveHeaderSheetPeekHeightPx({ safeAreaBottomPx, isStandalone })
        : resolveBrowseSheetPeekHeightPx({ safeAreaBottomPx, isStandalone }),
    }),
    [viewportHeightPx, safeAreaTopPx, sheetBottomInsetPx, safeAreaBottomPx, isStandalone, peekIncludesHeader],
  );
  // Where the reachable screen's own bottom edge sits, measured from the true top of the
  // physical screen — every sheet `top`/`y` position below is `sheetRestPx - heights[...]`
  // rather than `viewportHeightPx - heights[...]`, so a snap's height never has to know
  // its own screen position, only how tall it is.
  const sheetRestPx = viewportHeightPx - sheetBottomInsetPx;
  const targetSheetHeightPx = snap ? heights[snap] : null;
  const railGeometry = useNavigationRailGeometry();
  // The gap between the rail's own right edge and the surface's left edge matches
  // the rail's own gap from the viewport's left edge (railGeometry.left) — the same
  // measured offset used twice, rather than a second mirrored clearance constant, so
  // the two margins are equal by construction instead of by coincidence.
  const sideWorkspaceWidthPx = Math.max(
    0,
    viewportWidthPx - (railGeometry ? railGeometry.right + railGeometry.left : 0),
  );
  const targetWidthPx = props.presentation === 'sideWorkspace'
    ? sideWorkspaceWidthPx
    : props.presentation === 'persistent'
      ? resolvePanelWidthPx(props.state, viewportWidthPx)
      : props.presentation === 'sideOverlay'
        ? resolveSideOverlayWidthPx(viewportWidthPx, heightBand)
        : viewportWidthPx * (FULL_SCREEN_WIDTH_VW / 100);
  const dragControls = useDragControls();
  const dragConstraints = useMemo(
    () => ({ top: sheetRestPx - heights.full, bottom: sheetRestPx - heights.peek }),
    [sheetRestPx, heights],
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
      // The surface's own opaque background still spans down to the true screen bottom
      // (bottom stays viewportHeightPx below) — only its top edge shifts, so the reported
      // bounds keep matching what actually renders, not just the reachable content span.
      const targetTop = sheetRestPx - targetHeight;
      target = {
        left: 0,
        top: targetTop,
        right: viewportWidthPx,
        bottom: viewportHeightPx,
        width: viewportWidthPx,
        height: viewportHeightPx - targetTop,
      };
    } else {
      const targetWidth = panelOpen
        ? targetWidthPx
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
    publishDrawerSheetSnap(snap ?? null);
  }, [
    panelOpen,
    props.presentation,
    snap,
    targetWidthPx,
    targetSheetHeightPx,
    sheetRestPx,
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
      publishDrawerSheetSnap(null);
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
  const destinationWidth = props.presentation === 'bottomSheet'
    ? resting.width
    // The side overlay's own width never changes between open and closed — only its
    // horizontal position does (M06h) — so content always lays out at its one resting
    // width, whether the overlay is open or sliding off-screen closed.
    : props.presentation === 'sideOverlay'
      ? targetWidthPx
      : props.presentation === 'fullScreen' || props.presentation === 'sideWorkspace'
        ? panelOpen ? targetWidthPx : 0
        // Persistent's own targetWidthPx already resolves compact's floor
        // (resolvePanelWidthPx) — reused directly rather than tripling the last
        // resting width by the states' vw ratio, which assumed compact is always
        // exactly a third of expanded. Below a 1440px viewport that assumption
        // breaks (compact holds its 360px floor instead of shrinking with it), so
        // the tripled guess overshot the real destination for the whole toggle and
        // content only corrected once the animation finished and a fresh
        // measurement landed.
        : targetWidthPx;

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
    const heightPx = sheetRestPx - surface.getBoundingClientRect().top;
    const nextSnap = nearestSheetSnap({ heightPx, velocityPx: info.velocity.y, heights, availableSnaps });
    if (Math.abs(info.offset.y) >= SHEET_KEYBOARD_DISMISS_DRAG_THRESHOLD_PX) {
      dismissActiveTextEntry();
    }
    if (nextSnap === snap) {
      // The resolved snap did not change, so nothing re-renders and the declarative
      // `animate` prop below never recomputes its target. Settle explicitly instead of
      // leaving the sheet wherever a slow, deliberate drag happened to release it.
      animateSurface(surface, { y: sheetRestPx - heights[nextSnap] }, prefersReducedMotion ? { duration: 0 } : DRAWER_SHELL_TRANSITION);
      return;
    }
    onSnapChange(nextSnap);
  };

  // Every branch names x, y, and width, even though each only animates the one its own
  // presentation actually moves. An animated value is written to the element as an inline
  // style and stays there; a target that omitted a property would leave whichever
  // presentation set it last in place, outranking the stylesheet. Live-resizing a window
  // from wide to compact would then show the sheet still wearing the panel's 25vw width,
  // and only a reload — which mounts straight into the sheet — would look right.
  const animate = props.presentation === 'bottomSheet'
    ? { x: '0%', y: sheetRestPx - heights[props.snap], width: '100%' }
    : props.presentation === 'sideOverlay'
      // Its own width never moves (M06h): opening/closing translates the unchanged box
      // on/off screen instead of scaling it down, which used to visibly squeeze whatever
      // it was showing. Rendered at the exact pixel value targetWidthPx already computed
      // and published above, not a second, independently-derived vw expression — that
      // second expression is exactly what would silently disagree once the regular-height
      // floor exists.
      ? { x: panelOpen ? '0%' : '100%', y: 0, width: `${targetWidthPx}px` }
      : {
        x: '0%',
        y: 0,
        width: props.presentation === 'sideWorkspace'
          ? panelOpen
            ? `${sideWorkspaceWidthPx}px`
            : '0px'
          : props.presentation === 'fullScreen'
            ? panelOpen
              ? `${FULL_SCREEN_WIDTH_VW}vw`
              : '0vw'
            // Persistent's own target width already resolves compact's floor
            // (resolvePanelWidthPx) — reused here so the surface actually renders
            // at the same width its target geometry (and everything measuring it,
            // including the globe's camera occlusion) already believes it is.
            : `${targetWidthPx}px`,
      };
  // The properties a presentation does not animate are corrected instantly: a band
  // crossing is a presentation swap, not a movement the user should watch, and opening
  // or closing a fixed-width presentation moves only the one axis that presentation owns.
  const transition = deriveDrawerSurfaceTransition({
    isBottomSheet: props.presentation === 'bottomSheet',
    isSideOverlay: props.presentation === 'sideOverlay',
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
        data-drawer-sheet-has-header={peekIncludesHeader ? true : undefined}
        data-drawer-modality={modality}
        initial={false}
        // Snap travel stops above the home gesture, but the painted content continues
        // through that bottom strip so imagery reaches the physical screen edge.
        style={props.presentation === 'bottomSheet'
          ? { '--wa-sheet-visible-height': `${heights[props.snap] + sheetBottomInsetPx}px` } as CSSProperties
          : undefined}
        animate={animate}
        transition={transition}
        drag={isSheetDraggable ? 'y' : false}
        dragControls={isSheetDraggable ? dragControls : undefined}
        dragListener={isSheetDraggable ? !contentScrolledFromTop : undefined}
        dragConstraints={isSheetDraggable ? dragConstraints : undefined}
        dragElastic={isSheetDraggable ? SHEET_DRAG_ELASTIC : undefined}
        dragMomentum={false}
        onDrag={isSheetDraggable ? handleSheetDrag : undefined}
        onDragEnd={isSheetDraggable ? handleSheetDragEnd : undefined}
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
            onPointerDown={isSheetDraggable ? (event) => dragControls.start(event) : undefined}
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
