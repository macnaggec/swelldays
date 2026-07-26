import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type UIEventHandler,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './PanelLayout.module.css';

const PanelLayoutFooterTargetContext = createContext<HTMLElement | null>(null);
const PanelLayoutRailTargetContext = createContext<HTMLElement | null>(null);

interface PanelLayoutProps {
  header?: ReactNode;
  metadata?: ReactNode;
  stickyChrome?: ReactNode;
  onScrollCapture?: UIEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

export function PanelLayout({
  header,
  metadata,
  stickyChrome,
  onScrollCapture,
  children,
}: PanelLayoutProps) {
  const [footerTarget, setFooterTarget] = useState<HTMLDivElement | null>(null);
  const [railTarget, setRailTarget] = useState<HTMLDivElement | null>(null);

  return (
    <PanelLayoutFooterTargetContext.Provider value={footerTarget}>
      <PanelLayoutRailTargetContext.Provider value={railTarget}>
        <div className={styles.root} data-panel-layout>
          {header && <div data-panel-layout-header>{header}</div>}
          {metadata && <div data-panel-layout-metadata>{metadata}</div>}

          <div className={styles.body} data-panel-layout-body>
            <div
              className={styles.scroller}
              data-panel-layout-scroller
              data-panel-scroll-owner
              onScrollCapture={onScrollCapture}
            >
              {/*
                * Rendered as a direct child of the scroll owner on purpose: a
                * `position: sticky` child is constrained to its parent's box, so
                * wrapping it in an element only as tall as the chrome itself
                * leaves zero travel to stick within and the row scrolls away
                * with the content instead of pinning.
                */}
              {stickyChrome}
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
