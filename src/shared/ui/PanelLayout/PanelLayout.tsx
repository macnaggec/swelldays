import {
  createContext,
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
  const {
    hidden,
    scrolledFromTop,
    sheetSnap,
    drawerPresentation,
  } = usePanelScrollChromeState();
  // Compact mobile surfaces float footer actions above their scrolling content:
  // portrait uses a bottom sheet, while short landscape uses a side overlay. A
  // sideWorkspace already has a full-height panel where the ordinary footer row can
  // stay visible without covering the cards above it.
  const floatsFooter = sheetSnap !== undefined || drawerPresentation === 'sideOverlay';

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
  useLayoutEffect(() => {
    const scrollOwner = scrollOwnerRef.current;
    const stickyChrome = stickyChromeTarget;
    if (!scrollOwner || !stickyChrome) return;

    const publishChromeHeight = () => {
      const height = stickyChrome.offsetHeight;
      scrollOwner.style.setProperty('--wa-panel-chrome-height', `${height}px`);
      scrollOwner.dataset.panelChromeHeight = String(hidden ? 0 : height);
    };
    publishChromeHeight();

    const observer = new ResizeObserver(publishChromeHeight);
    observer.observe(stickyChrome, { box: 'border-box' });
    return () => observer.disconnect();
  }, [hidden, scrolledFromTop, stickyChromeTarget, contentWidth]);

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
    <PanelLayoutFooterTargetContext.Provider value={footerTarget}>
      <PanelLayoutRailTargetContext.Provider value={railTarget}>
        <PanelLayoutMetadataTargetContext.Provider value={metadataTarget}>
          <PanelLayoutStickyChromeTargetContext.Provider value={stickyChromeTarget}>
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
            </div>
          </PanelLayoutStickyChromeTargetContext.Provider>
        </PanelLayoutMetadataTargetContext.Provider>
      </PanelLayoutRailTargetContext.Provider>
    </PanelLayoutFooterTargetContext.Provider>
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
  const { hidden } = usePanelScrollChromeState();
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
  const { hidden } = usePanelScrollChromeState();
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
