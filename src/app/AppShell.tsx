import { GlobeScene } from 'views/GlobeScene';
import { AppNavigation } from 'widgets/AppNavigation';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import type { ReactNode } from 'react';
import styles from './AppShell.module.css';

export function AppShell({ children }: { children?: ReactNode }) {
  const layoutPolicy = useAppShellLayoutPolicy();
  const { isStandalone } = useViewportCapabilities();

  return (
    <div
      className={styles.root}
      data-app-display-mode={isStandalone ? 'standalone' : 'browser'}
    >
      {layoutPolicy.map.interaction !== 'hidden' && <GlobeScene />}
      <AppNavigation
        presentation={layoutPolicy.navigation}
        drawerPresentation={layoutPolicy.drawer.presentation}
      />
      {children}
    </div>
  );
}
