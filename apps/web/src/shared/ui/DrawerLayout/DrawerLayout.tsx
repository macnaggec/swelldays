import { type ReactNode } from 'react';
import styles from './DrawerLayout.module.css';

/**
 * FloatingAction — sticky bottom-center anchor for floating action buttons
 * (Publish, Cart, Checkout). Rendered inside the SidePanel body scroll container;
 * position: sticky keeps the button visible at the bottom as content scrolls.
 */
export function FloatingAction({ children }: { children: ReactNode }) {
  return <div className={styles.floatingAction}>{children}</div>;
}
