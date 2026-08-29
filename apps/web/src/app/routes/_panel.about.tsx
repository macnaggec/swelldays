import { createFileRoute } from '@tanstack/react-router';
import { ABOUT_PAGE_DESCRIPTION, ABOUT_PAGE_TITLE } from '@swelldays/contracts/core';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { AboutPanel } from 'features/About';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/about')({
  staticData: { appRouteIntent: 'siteWorkspace', panelHeader: 'About' },
  head: () => ({
    meta: buildPageMeta({ title: ABOUT_PAGE_TITLE, description: ABOUT_PAGE_DESCRIPTION }),
    links: buildCanonicalLink('/about'),
  }),
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <PanelGalleryLayout>
      <AboutPanel />
    </PanelGalleryLayout>
  );
}
