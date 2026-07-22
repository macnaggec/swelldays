import { useMatches } from '@tanstack/react-router';
import { GlobeScene } from 'views/GlobeScene';
import { LeftStrip } from 'widgets/LeftStrip';
import { useAddSpotStore } from 'features/AddSpot';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { deriveDesktopFoundationAppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';

export function AppShell() {
  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const matches = useMatches();
  const routeIntent = resolveAppRouteIntent(
    matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const browseExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const galleryExpanded = usePanelExpansionStore((state) => state.galleryExpanded);
  const layoutPolicy = deriveDesktopFoundationAppShellLayoutPolicy({
    routeIntent,
    preferences: { browseExpanded, galleryExpanded },
  });

  return (
    <>
      {layoutPolicy.map.interaction !== 'hidden' && <GlobeScene />}
      {layoutPolicy.navigation === 'leftStrip' && <LeftStrip />}
    </>
  );
}
