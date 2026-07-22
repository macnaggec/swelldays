import { createFileRoute } from '@tanstack/react-router';
import { PublicGallery } from 'features/PublicGallery';
import { usePanelExpanded, usePanelFilter } from './_panel';

export const Route = createFileRoute('/_panel/$spotId/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
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
