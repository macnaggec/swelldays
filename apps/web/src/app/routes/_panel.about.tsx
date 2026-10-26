import { createFileRoute } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { AboutPanel } from 'features/About';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/about')({
  staticData: { appRouteIntent: 'siteWorkspace', panelHeader: 'About' },
  loader: () => staticPublicDocument('about'),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <PanelGalleryLayout>
      <AboutPanel />
    </PanelGalleryLayout>
  );
}
