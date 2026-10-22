import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
  type UIEventHandler,
} from 'react';
import { createPortal } from 'react-dom';
import { useMergedRef } from '@mantine/hooks';
import { useMeasuredWidth } from 'shared/hooks/useMeasuredWidth';
import {
  useRegisterSheetScrollOwner,
  useSheetContentScrollable,
} from 'shared/ui/DrawerShell/sheetScrollCoupling';
import { useSettledLayout } from 'shared/ui/DrawerShell/panelSettledWidth';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { materialClasses } from 'shared/ui/design-system';
import styles from './PanelLayout.module.css';

const PanelLayoutFooterTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutRailTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutMetadataTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutStickyChromeTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutOverlayTargetContext = createContext<HTMLElement | null>(null);
// Lets the row's own portaled content force an immediate remeasure the moment it
// renders — see the effect below for why ResizeObserver alone isn't enough.
const PanelLayoutStickyChromeRemeasureContext = createContext<(() => void) | null>(null);

interface PanelLayoutProps {
  header?: ReactNode;
  onScrollCapture?: (
    event: UIEvent<HTMLDivElement>,
    pinnedChromeHeightPx: number,
  ) => void;
  children?: ReactNode;
}

export function PanelLayout({
  header,
  onScrollCapture,
  children,
}: PanelLayoutProps) {
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const [railTarget, setRailTarget] = useState<HTMLDivElement | null>(null);
  const [metadataTarget, setMetadataTarget] = useState<HTMLDivElement | null>(null);
  const [stickyChromeTarget, setStickyChromeTarget] = useState<HTMLDivElement | null>(null);
  const [overlayTarget, setOverlayTarget] = useState<HTMLDivElement | null>(null);
  const {
    hidden,
    scrolledFromTop,
    sheetSnap,
    drawerPresentation,
  } = usePanelScrollChromeState();
  // Every surface floats footer actions above their scrolling content, not just the
  // compact/mobile ones: portrait uses a bottom sheet (or, for a siteWorkspace/
  // routeWorkspace route like Cart, the edge-to-edge fullScreen presentation those
  // intents use instead of a sheet on a phone), short landscape uses a side overlay
  // (or, again for a siteWorkspace route, the sideWorkspace panel that presentation
  // uses instead), and desktop's own persistent panel is no different — Upload's
  // Cancel/Publish row and Cart's checkout row both sat glued to the bottom of the
  // one shared panel surface there the same way they did on every mobile presentation
  // before each was added here in turn: sideWorkspace and fullScreen were originally
  // left out on the assumption their own full-height panel gave a footer enough room
  // to stay visible without floating, and persistent was never even considered
  // because it isn't a compact surface — but the footer's own content never depended
  // on being compact to want floating above what it sits over.
  const floatsFooter = sheetSnap !== undefined
    || drawerPresentation === 'sideOverlay'
    || drawerPresentation === 'fullScreen'
    || drawerPresentation === 'sideWorkspace'
    || drawerPresentation === 'persistent';

  // Everything in the panel — search row, filter pills, cards — lays itself out once,
  // at the width the drawer is heading for, instead of being re-flowed on every frame
  // of the drawer's width animation. Without this the search row wraps its pills onto
  // extra lines part-way through the open and snaps back to one line at the end, which
  // reads as a whole-app breakpoint change rather than one panel resizing.
  const [measuredWidth, measureRef] = useMeasuredWidth();
  const { boxWidth, contentWidth, transitioning } = useSettledLayout(measuredWidth);
  const registerSheetScrollOwner = useRegisterSheetScrollOwner();
  const contentScrollable = useSheetContentScrollable();
  const handleScrollCapture: UIEventHandler<HTMLDivElement> = (event) => {
    onScrollCapture?.(
      event,
      event.target === event.currentTarget
        ? stickyChromeTarget?.offsetHeight ?? 0
        : 0,
    );
  };

  // Published on the scroll owner itself for two consumers. CSS uses the row's full
  // rendered height as the content's initial top space; PanelCollectionGrid reads the
  // data attribute to avoid anchoring a card behind visible chrome. The row itself lives
  // in a sibling overlay so the scroll owner's necessary overflow clip cannot cut off
  // focus rings, shadows, or corner badges. ResizeObserver keeps both projections tied
  // to the DOM-owned rendered height without exposing another layout interface.
  const scrollOwnerRef = useRef<HTMLDivElement | null>(null);
  const scrollOwnerMergedRef = useMergedRef(registerSheetScrollOwner, scrollOwnerRef);
  // A stable function instead of an effect-local closure so the row's own portaled
  // content (PanelLayoutStickyChrome) can also call it directly, synchronously, the
  // instant its own children change height — ResizeObserver alone only reports a
  // change one frame after it already painted, which is late enough to show a card
  // behind the row for that frame whenever the row's content changes after mount
  // (new filter pills, search results settling in) rather than at mount itself.
  const publishChromeHeight = useCallback(() => {
    const scrollOwner = scrollOwnerRef.current;
    const stickyChrome = stickyChromeTarget;
    if (!scrollOwner || !stickyChrome) return;

    const height = stickyChrome.offsetHeight;
    const topOffset = Number.parseFloat(
      getComputedStyle(scrollOwner).getPropertyValue('--wa-panel-chrome-top-offset'),
    ) || 0;
    const occupiedHeight = height + topOffset;
    scrollOwner.style.setProperty('--wa-panel-chrome-height', `${occupiedHeight}px`);
    scrollOwner.dataset.panelChromeHeight = String(hidden ? 0 : occupiedHeight);
  }, [stickyChromeTarget, hidden]);

  // A header-bearing sheet uses Peek as a compact view of the first form row. Unlike
  // Browse's pinned search chrome, that row lives inside this scroll owner, so retaining
  // Full's scrollTop would leave it above Peek's visible slice. Park Full's position,
  // show the top before the compact snap paints, then restore the form position when
  // Full returns. Headerless Browse sheets deliberately keep their list position.
  const previousSheetSnapRef = useRef(sheetSnap);
  const headerSheetFullScrollTopRef = useRef(0);
  useLayoutEffect(() => {
    const scrollOwner = scrollOwnerRef.current;
    const previousSheetSnap = previousSheetSnapRef.current;
    previousSheetSnapRef.current = sheetSnap;

    const isHeaderBearingSheet = drawerPresentation === 'bottomSheet' && header != null;
    if (!scrollOwner || !isHeaderBearingSheet || previousSheetSnap === sheetSnap) return;

    if (previousSheetSnap === 'full' && sheetSnap !== undefined && sheetSnap !== 'full') {
      headerSheetFullScrollTopRef.current = scrollOwner.scrollTop;
      scrollOwner.scrollTop = 0;
      return;
    }

    if (sheetSnap === 'full' && previousSheetSnap !== undefined && previousSheetSnap !== 'full') {
      scrollOwner.scrollTop = headerSheetFullScrollTopRef.current;
    }
  }, [drawerPresentation, header, sheetSnap]);

  useLayoutEffect(() => {
    if (!scrollOwnerRef.current || !stickyChromeTarget) return;
    publishChromeHeight();

    const observer = new ResizeObserver(publishChromeHeight);
    observer.observe(stickyChromeTarget, { box: 'border-box' });
    return () => observer.disconnect();
  }, [publishChromeHeight, scrolledFromTop, stickyChromeTarget, contentWidth, sheetSnap, header]);

  // The floating footer's own height, so the sheet-scoped `.content` can reserve exactly
  // that much bottom clearance and the footer never overlaps the last field it floats
  // above. A ResizeObserver — the same mechanism `useMeasuredWidth` above uses for the
  // panel's own width — rather than a dependency-array effect that calls setState
  // directly: the latter trips `react-hooks/set-state-in-effect` (setState is meant to
  // synchronize with an external system's own change notifications, not be invoked
  // unconditionally from inside the effect body), and it reacts to every actual height
  // change (e.g. from a content-width or sheet-snap driven reflow) without having to
  // enumerate each possible cause as a dependency.
  const [footerHeight, setFooterHeight] = useState(0);
  useLayoutEffect(() => {
    if (!footerTarget) return;
    const observer = new ResizeObserver(() => {
      setFooterHeight(footerTarget.offsetHeight);
    });
    observer.observe(footerTarget);
    return () => observer.disconnect();
  }, [footerTarget]);

  // Closing, these differ, and the panel needs both at once. Its *box* stays wide so
  // cards still travelling across the space being given up are not clipped away; its
  // *chrome* — header, search row, card area, footer — takes the width it will settle
  // at, so each moves to its final place along with the panel instead of holding the
  // old arrangement and snapping when the panel arrives. Opening, the two are equal and
  // this does nothing.
  const rootStyle: Record<string, string> = {};
  if (boxWidth !== null) rootStyle.width = `${boxWidth}px`;
  if (
    transitioning
    && contentWidth !== null
    && boxWidth !== null
    && contentWidth < boxWidth
  ) {
    rootStyle['--wa-panel-content-width'] = `${contentWidth}px`;
  }
  if (floatsFooter) rootStyle['--wa-panel-footer-height'] = `${footerHeight}px`;

  return (
    <PanelLayoutOverlayTargetContext.Provider value={overlayTarget}>
      <PanelLayoutFooterTargetContext.Provider value={footerTarget}>
        <PanelLayoutRailTargetContext.Provider value={railTarget}>
          <PanelLayoutMetadataTargetContext.Provider value={metadataTarget}>
            <PanelLayoutStickyChromeTargetContext.Provider value={stickyChromeTarget}>
              <PanelLayoutStickyChromeRemeasureContext.Provider value={publishChromeHeight}>
              <div
                className={styles.root}
                data-panel-layout
                data-sheet-snap={sheetSnap}
                data-drawer-presentation={drawerPresentation}
                ref={measureRef}
                style={Object.keys(rootStyle).length === 0 ? undefined : rootStyle}
              >
                {header && <div data-panel-layout-header>{header}</div>}
                <div ref={setMetadataTarget} className={styles.metadata} data-panel-layout-metadata />

                <div className={styles.body} data-panel-layout-body>
                  <div className={styles.scrollRegion} data-panel-layout-scroll-region>
                    <div
                      className={styles.scroller}
                      data-panel-layout-scroller
                      data-panel-scroll-owner
                      data-content-scroll={contentScrollable ? undefined : 'locked'}
                      ref={scrollOwnerMergedRef}
                      onScrollCapture={handleScrollCapture}
                    >
                      <div className={styles.content} data-panel-layout-content>
                        {children}
                      </div>
                    </div>

                    <div className={styles.chromeViewport}>
                      <div
                        ref={setStickyChromeTarget}
                        className={styles.stickyChrome}
                        data-panel-scroll-chrome
                        data-hidden={hidden || undefined}
                        data-scrolled-from-top={scrolledFromTop || undefined}
                      />
                    </div>
                  </div>

                  <div
                    ref={setRailTarget}
                    className={styles.rail}
                    data-panel-layout-rail
                  />
                </div>

                <div
                  ref={setFooterTarget}
                  className={floatsFooter ? `${styles.footer} ${materialClasses.chrome}` : styles.footer}
                  data-panel-layout-footer
                />
                <div
                  ref={setOverlayTarget}
                  className={styles.overlayTarget}
                  data-panel-layout-overlay-target
                />
              </div>
              </PanelLayoutStickyChromeRemeasureContext.Provider>
            </PanelLayoutStickyChromeTargetContext.Provider>
          </PanelLayoutMetadataTargetContext.Provider>
        </PanelLayoutRailTargetContext.Provider>
      </PanelLayoutFooterTargetContext.Provider>
    </PanelLayoutOverlayTargetContext.Provider>
  );
}

/**
 * Pinned chrome beside the panel's scroller: content portaled here sits at the
 * panel's right edge spanning the scroll viewport, so it does not travel with
 * the scrolled content. Overflowing rail content scrolls independently with
 * the native scrollbar hidden (see PanelLayout.module.css). Renders nothing
 * when mounted outside a PanelLayout.
 */
export function PanelLayoutRail({ children }: { children: ReactNode }) {
  const railTarget = useContext(PanelLayoutRailTargetContext);
  return railTarget ? createPortal(children, railTarget) : null;
}

export function PanelLayoutFooter({ children }: { children: ReactNode }) {
  const footerTarget = useContext(PanelLayoutFooterTargetContext);
  return footerTarget ? createPortal(children, footerTarget) : null;
}

/**
 * Root-level panel layer for route-owned interaction locks. Unlike content or
 * footer portals, this target covers the complete panel surface, including its
 * floating footer. Renders nothing when mounted outside a PanelLayout.
 */
export function PanelLayoutOverlay({ children }: { children: ReactNode }) {
  const overlayTarget = useContext(PanelLayoutOverlayTargetContext);
  return overlayTarget ? createPortal(children, overlayTarget) : null;
}

/**
 * Pinned metadata region between the panel header and the scroll owner:
 * content portaled here stays put while panel content scrolls. Renders
 * nothing when mounted outside a PanelLayout.
 */
export function PanelLayoutMetadata({ children }: { children: ReactNode }) {
  const metadataTarget = useContext(PanelLayoutMetadataTargetContext);
  return metadataTarget ? createPortal(children, metadataTarget) : null;
}

/**
 * The panel's pinned search/filter row: content portaled here mounts in the one
 * overlay row PanelLayout renders beside the clipped scroll owner, so it pins
 * while content scrolls, can paint corner effects without clipping, and hides on
 * scroll down. Renders nothing when mounted outside a PanelLayout.
 */
export function PanelLayoutStickyChrome({
  children,
  spacing,
}: {
  children: ReactNode;
  spacing?: 'flush';
}) {
  const stickyChromeTarget = useContext(PanelLayoutStickyChromeTargetContext);
  const remeasure = useContext(PanelLayoutStickyChromeRemeasureContext);
  const { hidden } = usePanelScrollChromeState();
  // Runs after every render of this row's own content — catches height changes
  // (search results settling in, filter pills appearing) the instant they commit,
  // rather than waiting on ResizeObserver's own next-frame notification.
  useLayoutEffect(() => {
    remeasure?.();
  });
  // The opposite case: this route's own content going away entirely (e.g.
  // navigating to a route that publishes nothing into the row at all), so the
  // row's now-empty height is republished immediately rather than left at this
  // route's last measurement until an unrelated scroll event happens to trigger
  // the next remeasure. Deliberately its own effect with an empty dependency
  // array — a cleanup on the effect above would also re-fire on every render
  // this component stays mounted (every scroll-driven `hidden` toggle included),
  // not just on the unmount it's meant for. The ref keeps the unmount call
  // reading the latest `remeasure`, since an empty-deps effect's own closure is
  // fixed to the function that existed at mount.
  const remeasureRef = useRef(remeasure);
  useLayoutEffect(() => {
    remeasureRef.current = remeasure;
  });
  useLayoutEffect(() => () => remeasureRef.current?.(), []);
  return stickyChromeTarget
    ? createPortal(
      <div
        data-panel-scroll-chrome-primary
        data-panel-scroll-chrome-spacing={spacing}
        aria-hidden={hidden || undefined}
        inert={hidden}
      >
        {children}
      </div>,
      stickyChromeTarget,
    )
    : null;
}

/**
 * Alternate content for the same pinned chrome row. It becomes interactive
 * only while the primary search/filter publication is hidden.
 */
export function PanelLayoutStickyChromeReplacement({ children }: { children: ReactNode }) {
  const stickyChromeTarget = useContext(PanelLayoutStickyChromeTargetContext);
  const remeasure = useContext(PanelLayoutStickyChromeRemeasureContext);
  const { hidden } = usePanelScrollChromeState();
  // See PanelLayoutStickyChrome's identical pair of effects for why the unmount
  // case needs to be its own empty-deps effect rather than a cleanup on this one.
  useLayoutEffect(() => {
    remeasure?.();
  });
  const remeasureRef = useRef(remeasure);
  useLayoutEffect(() => {
    remeasureRef.current = remeasure;
  });
  useLayoutEffect(() => () => remeasureRef.current?.(), []);
  return stickyChromeTarget
    ? createPortal(
      <div
        data-panel-scroll-chrome-replacement
        aria-hidden={!hidden || undefined}
        inert={!hidden}
      >
        {children}
      </div>,
      stickyChromeTarget,
    )
    : null;
}
