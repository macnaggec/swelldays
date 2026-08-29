import { createFileRoute } from '@tanstack/react-router';
import { spotGalleryDescription, spotGalleryTitle } from '@swelldays/contracts/core';
import { PublicGallery } from 'features/PublicGallery';
import { trpcProxy } from 'shared/lib/trpcClient';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';
import { usePanelExpanded, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/$spotId/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
  loader: async ({ params: { spotId }, context: { queryClient } }) =>
    queryClient.ensureQueryData(trpcProxy.spots.byId.queryOptions(spotId)),
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
  const { spotId } = Route.useParams();
  const { filters, clearFilters } = usePanelFilter();
  const expanded = usePanelExpanded();
  return (
    <PublicGallery
      expanded={expanded}
      spotId={spotId}
      filters={filters}
      onClearFilters={clearFilters}
    />
  );
}
