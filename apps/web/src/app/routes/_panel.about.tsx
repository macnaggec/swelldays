import { createFileRoute } from '@tanstack/react-router';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { AboutPanel } from 'features/About';

export const Route = createFileRoute('/_panel/about')({
  staticData: { appRouteIntent: 'siteWorkspace', panelHeader: 'About' },
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <PanelGalleryLayout>
      <AboutPanel />
    </PanelGalleryLayout>
  );
}
