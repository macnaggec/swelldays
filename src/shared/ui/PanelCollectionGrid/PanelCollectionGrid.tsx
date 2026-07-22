import type { HTMLAttributes } from 'react';
import styles from './PanelCollectionGrid.module.css';

interface PanelCollectionGridProps extends HTMLAttributes<HTMLDivElement> {
  preview?: boolean;
}

export function PanelCollectionGrid({
  className,
  preview = false,
  ...props
}: PanelCollectionGridProps) {
  return (
    <div
      {...props}
      className={[styles.root, className].filter(Boolean).join(' ')}
      data-panel-collection-grid
      data-preview={preview || undefined}
    />
  );
}
