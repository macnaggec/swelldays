import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type UIEventHandler,
} from 'react';
import { createPortal } from 'react-dom';
import { useMeasuredWidth } from 'shared/hooks/useMeasuredWidth';
import {
  useRegisterSheetScrollOwner,
  useSheetContentScrollable,
} from 'shared/ui/DrawerShell/sheetScrollCoupling';
import { useSettledLayout } from 'shared/ui/DrawerShell/panelSettledWidth';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import styles from './PanelLayout.module.css';

const PanelLayoutFooterTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutRailTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutMetadataTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutStickyChromeTargetContext = createContext<HTMLElement | null>(null);

interface PanelLayoutProps {
  header?: ReactNode;
  onScrollCapture?: UIEventHandler<HTMLDivElement>;
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
  const { hidden } = usePanelScrollChromeState();

  // Everything in the panel — search row, filter pills, cards — lays itself out once,
  // at the width the drawer is heading for, instead of being re-flowed on every frame
  // of the drawer's width animation. Without this the search row wraps its pills onto
  // extra lines part-way through the open and snaps back to one line at the end, which
  // reads as a whole-app breakpoint change rather than one panel resizing.
  const [measuredWidth, measureRef] = useMeasuredWidth();
  const { boxWidth, contentWidth, transitioning } = useSettledLayout(measuredWidth);
  const registerSheetScrollOwner = useRegisterSheetScrollOwner();
  const contentScrollable = useSheetContentScrollable();

  // Closing, these differ, and the panel needs both at once. Its *box* stays wide so
  // cards still travelling across the space being given up are not clipped away; its
  // *chrome* — header, search row, card area, footer — takes the width it will settle
  // at, so each moves to its final place along with the panel instead of holding the
  // old arrangement and snapping when the panel arrives. Opening, the two are equal and
  // this does nothing.
  const rootStyle: Record<string, string> = {};
  if (boxWidth !== null) rootStyle.width = `${boxWidth}px`;
  if (transitioning && contentWidth !== null && boxWidth !== null && contentWidth < boxWidth) {
    rootStyle['--wa-panel-content-width'] = `${contentWidth}px`;
  }

  return (
    <PanelLayoutFooterTargetContext.Provider value={footerTarget}>
      <PanelLayoutRailTargetContext.Provider value={railTarget}>
        <PanelLayoutMetadataTargetContext.Provider value={metadataTarget}>
          <PanelLayoutStickyChromeTargetContext.Provider value={stickyChromeTarget}>
            <div
              className={styles.root}
              data-panel-layout
              ref={measureRef}
              style={Object.keys(rootStyle).length === 0 ? undefined : rootStyle}
            >
              {header && <div data-panel-layout-header>{header}</div>}
              <div ref={setMetadataTarget} className={styles.metadata} data-panel-layout-metadata />

              <div className={styles.body} data-panel-layout-body>
                <div
                  className={styles.scroller}
                  data-panel-layout-scroller
                  data-panel-scroll-owner
                  data-content-scroll={contentScrollable ? undefined : 'locked'}
                  ref={registerSheetScrollOwner}
                  onScrollCapture={onScrollCapture}
                >
                  {/*
                    * Rendered as a direct child of the scroll owner on purpose: a
                    * `position: sticky` child is constrained to its parent's box, so
                    * wrapping it in an element only as tall as the chrome itself
                    * leaves zero travel to stick within and the row scrolls away
                    * with the content instead of pinning.
                    */}
                  <div
                    ref={setStickyChromeTarget}
                    className={styles.stickyChrome}
                    data-panel-scroll-chrome
                    data-hidden={hidden || undefined}
                  />
                  <div className={styles.content} data-panel-layout-content>
                    {children}
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
                className={styles.footer}
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
 * sticky row PanelLayout renders directly inside the scroll owner, so it pins
 * while content scrolls and hides on scroll down. Renders nothing when mounted
 * outside a PanelLayout.
 */
export function PanelLayoutStickyChrome({ children }: { children: ReactNode }) {
  const stickyChromeTarget = useContext(PanelLayoutStickyChromeTargetContext);
  return stickyChromeTarget ? createPortal(children, stickyChromeTarget) : null;
}
