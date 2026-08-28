import type { CSSProperties, ReactNode } from 'react';
import { useDrawerAdjacentInlineEndInset, useDrawerGeometry, useDrawerMoving } from 'shared/ui/DrawerShell';
import { useNavigationRailGeometry } from 'shared/model/navigationRailGeometry';
import { materialClasses } from 'shared/ui/design-system';
import { AppButton } from 'shared/ui/AppButton';
import styles from './PanelRouteLayout.module.css';

const FLOATING_CONTROLS_EDGE_GAP_PX = 8;

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
  onIntent?: () => void;
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
  onIntent,
  disabled = false,
  showIndicator = false,
}: PanelRouteActionButtonProps) {
  return (
    <AppButton
      onClick={onClick}
      onPointerEnter={onIntent}
      onPointerDown={onIntent}
      onTouchStart={onIntent}
      onFocus={onIntent}
      disabled={disabled}
      data-panel-toolbar-action
      indicator={showIndicator
        ? <span className={styles.actionIndicator} data-panel-route-action-indicator />
        : undefined}
    >
      {children}
    </AppButton>
  );
}

export function FloatingPanelControls({ children }: { children: ReactNode }) {
  const inlineEndInset = useDrawerAdjacentInlineEndInset(FLOATING_CONTROLS_EDGE_GAP_PX);
  const drawerGeometry = useDrawerGeometry();
  const navRailGeometry = useNavigationRailGeometry();
  const drawerMoving = useDrawerMoving();

  // These sit beside the panel rather than in it, so there is no honest place for them
  // while it is moving: following the travelling edge drags them across the map, and
  // taking the final inset puts them where the panel is going while it is still where
  // it was. They wait until it has arrived, then appear.
  if (drawerMoving) return null;

  // Bounded by the same two chrome pieces it floats between — the nav rail/menu bar on
  // one side, the drawer on the other — measured the same way the drawer's own inset is
  // (drawer-shell-owns-adjacent-control-placement forbids a viewport-fraction formula
  // here). A narrower band (tablet) that can't fit every pill scrolls within this bound
  // instead of wrapping or running under either chrome piece — see .floatingControls.
  const maxWidthPx = drawerGeometry && navRailGeometry
    ? Math.max(0, drawerGeometry.left - navRailGeometry.right - 2 * FLOATING_CONTROLS_EDGE_GAP_PX)
    : undefined;

  const style: CSSProperties | undefined = inlineEndInset === null && maxWidthPx === undefined
    ? undefined
    : { insetInlineEnd: inlineEndInset ?? undefined, maxWidth: maxWidthPx };

  return (
    <div
      className={styles.floatingControls}
      data-floating-panel-controls
      data-positioned={inlineEndInset !== null || undefined}
      style={style}
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
        <AppButton
          tone="highlight"
          onClick={onAction}
          disabled={isPending}
        >
          {isPending ? pendingLabel ?? actionLabel : actionLabel}
        </AppButton>
      </div>
    </div>
  );
}
