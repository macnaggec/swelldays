import type { ReactNode } from 'react';
import { PanelLayoutFooter, PanelLayoutMetadata } from './PanelLayout';
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
        <PanelLayoutMetadata>
          <div className={styles.meta} data-panel-gallery-meta>
            {meta}
          </div>
        </PanelLayoutMetadata>
      )}

      <PanelScrollChrome />
      <div className={styles.galleryInset} data-panel-gallery-inset>
        {children}
      </div>

      {footer && <PanelLayoutFooter>{footer}</PanelLayoutFooter>}
    </div>
  );
}
