import { createFileRoute } from '@tanstack/react-router';
import { GALLERY_PAGE_DESCRIPTION, GALLERY_PAGE_TITLE } from '@swelldays/contracts/core';
import { PublicGallery } from 'features/PublicGallery';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';
import { usePanelExpanded, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
  head: () => ({
    meta: buildPageMeta({ title: GALLERY_PAGE_TITLE, description: GALLERY_PAGE_DESCRIPTION }),
    links: buildCanonicalLink('/gallery'),
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const { filters, clearFilters } = usePanelFilter();
  const expanded = usePanelExpanded();

  return (
    <PublicGallery
      expanded={expanded}
      filters={filters}
      onClearFilters={clearFilters}
    />
  );
}
