import { createFileRoute } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { PublicGallery } from 'features/PublicGallery';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';
import { usePanelExpanded, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
  loader: () => staticPublicDocument('gallery'),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
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
