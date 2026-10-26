import { createFileRoute } from '@tanstack/react-router';
import { spotPublicDocument } from '@swelldays/contracts/core';
import { loadPublicSessions } from 'app/lib/publicDocuments';
import { notFound } from '@tanstack/react-router';
import { PublicGallery } from 'features/PublicGallery';
import { trpcProxy } from 'shared/lib/trpcClient';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';
import { usePanelExpanded, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/$spotId/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
  // $spotId is a slug; resolve it to the spot's real id here once, since
  // PublicGallery filters the media feed by database id, not slug.
  loader: async ({ params: { spotId: slug }, context: { queryClient } }) => {
    const spot = await queryClient.ensureQueryData(trpcProxy.spots.bySlug.queryOptions(slug));
    if (!spot) throw notFound();
    const page = await loadPublicSessions(queryClient, spot.id);
    return { spot, document: spotPublicDocument(spot, true, page.items) };
  },
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData.document) : {},
  component: GalleryPage,
});

function GalleryPage() {
  const { spot } = Route.useLoaderData();
  const { filters, clearFilters } = usePanelFilter();
  const expanded = usePanelExpanded();
  if (!spot) return null;
  return (
    <PublicGallery
      expanded={expanded}
      spotId={spot.id}
      filters={filters}
      onClearFilters={clearFilters}
    />
  );
}
