import type { ReactNode } from 'react';
import { useDrawerAdjacentInlineEndInset, useDrawerMoving } from 'shared/ui/DrawerShell';
import { materialClasses } from 'shared/ui/design-system';
import styles from './PanelRouteLayout.module.css';

interface PanelRouteLayoutProps {
  header?: ReactNode;
  headerClassName?: string;
  onHeaderAnimationEnd?: () => void;
  children: ReactNode;
}

interface PanelEmptyStateProps {
  title: string;
  description: string;
  actionLabel: string;
  pendingLabel?: string;
  onAction: () => void;
  isPending?: boolean;
}

interface PanelSearchToolbarProps {
  primary: ReactNode;
  action?: ReactNode;
  trailing?: ReactNode;
  expanded?: boolean;
}

interface PanelRouteActionButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  showIndicator?: boolean;
}

export function PanelRouteLayout({
  header,
  headerClassName,
  onHeaderAnimationEnd,
  children,
}: PanelRouteLayoutProps) {
  return (
    <div className={styles.root} data-panel-route-layout>
      {header && (
        <div
          className={styles.header}
          data-panel-route-header
        >
          <div
            className={headerClassName}
            onAnimationEnd={onHeaderAnimationEnd}
          >
            {header}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function PanelSearchToolbar({
  primary,
  action,
  trailing,
  expanded = false,
}: PanelSearchToolbarProps) {
  return (
    <div
      className={styles.toolbar}
      data-panel-search-toolbar
      data-expanded={expanded || undefined}
    >
      <div
        className={`${styles.toolbarMain} ${expanded ? styles.toolbarMainExpanded : styles.toolbarMainCompact}`}
      >
        <div className={styles.toolbarPrimary} data-panel-toolbar-primary>
          {primary}
        </div>
        {action}
      </div>
      {trailing && (
        <div className={styles.toolbarTrailing} data-panel-toolbar-trailing>
          {trailing}
        </div>
      )}
    </div>
  );
}

export function FloatingPanelSearchToolbar({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${styles.floatingSearchToolbar} ${materialClasses.panel}`}
      data-browse-map-toolbar
      role="search"
      aria-label="Map search"
    >
      {children}
    </div>
  );
}

export function PanelRouteActionButton({
  children,
  onClick,
  disabled = false,
  showIndicator = false,
}: PanelRouteActionButtonProps) {
  return (
    <button
      type="button"
      className={styles.actionButton}
      onClick={onClick}
      disabled={disabled}
      data-panel-toolbar-action
    >
      {children}
      {showIndicator && <span className={styles.actionIndicator} data-panel-route-action-indicator />}
    </button>
  );
}

export function FloatingPanelControls({ children }: { children: ReactNode }) {
  const inlineEndInset = useDrawerAdjacentInlineEndInset(8);
  const drawerMoving = useDrawerMoving();

  // These sit beside the panel rather than in it, so there is no honest place for them
  // while it is moving: following the travelling edge drags them across the map, and
  // taking the final inset puts them where the panel is going while it is still where
  // it was. They wait until it has arrived, then appear.
  if (drawerMoving) return null;

  return (
    <div
      className={styles.floatingControls}
      data-floating-panel-controls
      data-positioned={inlineEndInset !== null || undefined}
      style={inlineEndInset === null ? undefined : { insetInlineEnd: inlineEndInset }}
    >
      {children}
    </div>
  );
}

export function PanelEmptyState({
  title,
  description,
  actionLabel,
  pendingLabel,
  onAction,
  isPending = false,
}: PanelEmptyStateProps) {
  return (
    <div className={styles.emptyRoot} data-panel-empty-state>
      <div className={styles.emptyContent}>
        <h2 className={styles.emptyTitle}>{title}</h2>
        <p className={styles.emptyDescription}>{description}</p>
        <button
          type="button"
          className={styles.emptyAction}
          onClick={onAction}
          disabled={isPending}
        >
          {isPending ? pendingLabel ?? actionLabel : actionLabel}
        </button>
      </div>
    </div>
  );
}
