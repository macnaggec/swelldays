import { createFileRoute } from '@tanstack/react-router';
import { spotGalleryDescription, spotGalleryTitle } from '@swelldays/contracts/core';
import { PublicGallery } from 'features/PublicGallery';
import { trpcProxy } from 'shared/lib/trpcClient';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';
import { usePanelExpanded, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/$spotId/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
  // $spotId is a slug; resolve it to the spot's real id here once, since
  // PublicGallery filters the media feed by database id, not slug.
  loader: async ({ params: { spotId: spotSlug }, context: { queryClient } }) =>
    queryClient.ensureQueryData(trpcProxy.spots.bySlug.queryOptions(spotSlug)),
  head: ({ loaderData, params }) => ({
    ...(loaderData && {
      meta: buildPageMeta({
        title: spotGalleryTitle(loaderData),
        description: spotGalleryDescription(loaderData),
      }),
    }),
    links: buildCanonicalLink(`/${params.spotId}/gallery`),
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const spot = Route.useLoaderData();
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
