import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { motion } from 'framer-motion';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { PANEL_WIDTH_VW } from 'shared/model/panelExpansionStore';
import { materialClasses } from 'shared/ui/design-system';
import { publishDrawerGeometry } from './geometry';
import { DRAWER_SHELL_TRANSITION } from './motion';
import styles from './DrawerShell.module.css';

export type DrawerShellPresentation = Exclude<
  AppShellLayoutPolicy['drawer']['presentation'],
  'hidden'
>;
export type DrawerShellState = Extract<
  AppShellLayoutPolicy['drawer']['state'],
  'compact' | 'expanded'
>;
export type DrawerShellModality = Exclude<
  AppShellLayoutPolicy['drawer']['modality'],
  'none'
>;

interface DrawerShellProps {
  presentation: DrawerShellPresentation;
  state: DrawerShellState;
  modality: DrawerShellModality;
  ariaLabel?: string;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children?: ReactNode;
}

export function DrawerShell({
  presentation,
  state,
  modality,
  ariaLabel = 'Content drawer',
  restoreFocusRef,
  children,
}: DrawerShellProps) {
  const surfaceRef = useRef<HTMLElement>(null);

  useEffect(() => () => {
    const focusTarget = restoreFocusRef?.current;
    if (!focusTarget?.isConnected) return;
    focusTarget.focus({ preventScroll: true });
  }, [restoreFocusRef]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    let pendingFrame: number | null = null;
    const measure = () => {
      pendingFrame = null;
      publishDrawerGeometry(surface.getBoundingClientRect());
    };
    const scheduleMeasurement = () => {
      if (pendingFrame !== null) return;
      pendingFrame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(scheduleMeasurement);

    observer.observe(surface);
    scheduleMeasurement();

    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      publishDrawerGeometry(null);
    };
  }, []);

  const isModal = modality === 'modal';

  return (
    <motion.aside
      ref={surfaceRef}
      aria-label={ariaLabel}
      aria-modal={isModal || undefined}
      role={isModal ? 'dialog' : undefined}
      className={`${styles.surface} ${materialClasses.panel}`}
      data-drawer-presentation={presentation}
      data-drawer-state={state}
      data-drawer-modality={modality}
      initial={false}
      animate={{ width: state === 'expanded' ? `${PANEL_WIDTH_VW.expanded}vw` : `${PANEL_WIDTH_VW.compact}vw` }}
      transition={{ width: DRAWER_SHELL_TRANSITION }}
    >
      {children}
    </motion.aside>
  );
}
