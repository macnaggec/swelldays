import { createFileRoute } from '@tanstack/react-router';
import { PublicGallery } from 'features/PublicGallery';
import { usePanelExpanded, usePanelFilter } from './_panel';

export const Route = createFileRoute('/_panel/gallery')({
  staticData: { appRouteIntent: 'galleryWorkspace' },
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
