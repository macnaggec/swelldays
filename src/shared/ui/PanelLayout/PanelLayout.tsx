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

  return (
    <PanelLayoutFooterTargetContext.Provider value={footerTarget}>
      <div className={styles.root} data-panel-layout>
        {header && <div data-panel-layout-header>{header}</div>}
        {metadata && <div data-panel-layout-metadata>{metadata}</div>}

        <div
          className={styles.scroller}
          data-panel-layout-scroller
          data-panel-scroll-owner
          onScrollCapture={onScrollCapture}
        >
          {stickyChrome && (
            <div data-panel-layout-sticky-chrome>
              {stickyChrome}
            </div>
          )}
          <div className={styles.content} data-panel-layout-content>
            {children}
          </div>
        </div>

        <div
          ref={setFooterTarget}
          className={styles.footer}
          data-panel-layout-footer
        />
      </div>
    </PanelLayoutFooterTargetContext.Provider>
  );
}

export function PanelLayoutFooter({ children }: { children: ReactNode }) {
  const footerTarget = useContext(PanelLayoutFooterTargetContext);
  return footerTarget ? createPortal(children, footerTarget) : null;
}
