import type { ReactNode } from 'react';
import { PanelLayoutFooter } from './PanelLayout';
import { PanelScrollChrome } from './PanelScrollChrome';
import styles from './PanelGalleryLayout.module.css';

interface PanelGalleryLayoutProps {
  meta?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function PanelGalleryLayout({ meta, footer, children }: PanelGalleryLayoutProps) {
  return (
    <div className={styles.root}>
      {meta && (
        <div className={styles.meta} data-panel-gallery-meta>
          {meta}
        </div>
      )}

      <div className={styles.scroller} data-panel-gallery-scroller>
        <PanelScrollChrome />
        <div className={styles.galleryInset} data-panel-gallery-inset>
          {children}
        </div>
      </div>

      {footer && <PanelLayoutFooter>{footer}</PanelLayoutFooter>}
    </div>
  );
}
