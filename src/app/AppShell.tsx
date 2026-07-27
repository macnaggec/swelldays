import { GlobeScene } from 'views/GlobeScene';
import { AppNavigation } from 'widgets/AppNavigation';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';

export function AppShell() {
  const layoutPolicy = useAppShellLayoutPolicy();

  return (
    <>
      {layoutPolicy.map.interaction !== 'hidden' && <GlobeScene />}
      <AppNavigation presentation={layoutPolicy.navigation} />
    </>
  );
}
