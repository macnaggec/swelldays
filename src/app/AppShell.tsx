import { GlobeScene } from 'views/GlobeScene';
import { LeftStrip } from 'widgets/LeftStrip';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';

export function AppShell() {
  const layoutPolicy = useAppShellLayoutPolicy();

  return (
    <>
      {layoutPolicy.map.interaction !== 'hidden' && <GlobeScene />}
      {layoutPolicy.navigation === 'leftStrip' && <LeftStrip />}
    </>
  );
}
