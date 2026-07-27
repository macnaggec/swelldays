import type { ReactElement } from 'react';
import type { AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import styles from './AppNavigation.module.css';
import { materialClasses } from 'shared/ui/design-system';
import { useCartStore } from 'entities/Commerce';
import { CartControl } from './CartControl';
import { UserControl } from './UserControl';

export interface AppNavigationProps {
  presentation: AppShellLayoutPolicy['navigation'];
}

export function AppNavigation({ presentation }: AppNavigationProps): ReactElement | null {
  const cartCount = useCartStore((s) => s.items.length);

  if (presentation === 'hidden') return null;

  return (
    <div className={styles.root} data-navigation-presentation={presentation}>
      <div className={`${styles.stack} ${materialClasses.chrome}`}>
        <div className={styles.button}>
          <UserControl />
        </div>
        {cartCount > 0 && (
          <div className={styles.button}>
            <CartControl />
          </div>
        )}
      </div>
    </div>
  );
}

export default AppNavigation;
