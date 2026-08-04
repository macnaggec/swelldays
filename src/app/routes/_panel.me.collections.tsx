import { createContext, useContext, useMemo, useState } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTabNavigation } from 'shared/hooks';
import { useTRPC } from 'shared/lib/trpc';
import type { SurfSessionItem } from 'entities/SurfSession';
import type { PublicMedia } from 'shared/types/media';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { CollectionsSectionBar, CollectionsToolbar } from 'features/Collections';
import { SidePanelFloating, SidePanelHeaderTrailing } from 'widgets/SidePanel';
import { PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';

const TAB_ROUTES = {
  uploads: '/me/collections',
  purchases: '/me/collections/purchases',
  favorites: '/me/collections/favorites',
} as const;

// Narrower than the shared panelCard density's own 3-column ceiling: this band's
// wider-than-default panel (see COLLECTIONS_SIDE_OVERLAY_WIDTH_VW in _panel.tsx)
// still shares its width with the map beside it, so it settles for two comfortable
// columns rather than three cramped ones.
const COLLECTIONS_SIDE_OVERLAY_MAX_COLUMNS = 2;

type CollectionsContextValue = {
  sessions: SurfSessionItem[];
  visibleUploads: SurfSessionItem[];
  isLoadingUploads: boolean;
  favorites: PublicMedia[];
  visibleFavorites: PublicMedia[];
  isLoadingFavorites: boolean;
  galleryMaxColumns: number | undefined;
};

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function useCollectionsContext() {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error('useCollectionsContext must be used inside CollectionsLayout');
  }

  return context;
}

export const Route = createFileRoute('/_panel/me/collections')({
  staticData: { panelHeader: 'My Collections' },
  component: CollectionsLayout,
});

function CollectionsLayout() {
  const trpc = useTRPC();
  const layoutPolicy = useAppShellLayoutPolicy();
  const floatsOverMap = layoutPolicy.drawer.presentation === 'sideOverlay';
  const { activeTab, handleTabChange } = useTabNavigation(TAB_ROUTES);
  const { data: sessions = [], isLoading: isLoadingUploads } = useQuery({
    ...trpc.sessions.mine.queryOptions(),
    enabled: activeTab === 'uploads',
  });
  const { data: favorites = [], isLoading: isLoadingFavorites } = useQuery({
    ...trpc.media.favorites.queryOptions(),
    enabled: activeTab === 'favorites',
  });
  const [spotFilter, setSpotFilter] = useState<string | null>(null);

  const uploadSpotOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const session of sessions) {
      if (!seen.has(session.spot.id)) seen.set(session.spot.id, session.spot.name);
    }

    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [sessions]);

  const favoriteSpotOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of favorites) {
      if (item.spot && !seen.has(item.spot.id)) seen.set(item.spot.id, item.spot.name);
    }

    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [favorites]);

  const spotOptions = activeTab === 'favorites' ? favoriteSpotOptions : uploadSpotOptions;

  const visibleUploads = useMemo(
    () => (spotFilter ? sessions.filter((session) => session.spot.id === spotFilter) : sessions),
    [sessions, spotFilter],
  );

  const visibleFavorites = useMemo(
    () => (spotFilter ? favorites.filter((item) => item.spot?.id === spotFilter) : favorites),
    [favorites, spotFilter],
  );

  const galleryMaxColumns = floatsOverMap ? COLLECTIONS_SIDE_OVERLAY_MAX_COLUMNS : undefined;

  const contextValue = useMemo(
    () => ({
      sessions,
      visibleUploads,
      isLoadingUploads,
      favorites,
      visibleFavorites,
      isLoadingFavorites,
      galleryMaxColumns,
    }),
    [sessions, visibleUploads, isLoadingUploads, favorites, visibleFavorites, isLoadingFavorites, galleryMaxColumns],
  );

  const toolbar = (
    <CollectionsToolbar
      activeTab={activeTab ?? 'uploads'}
      spotOptions={spotOptions}
      spotFilter={spotFilter}
      onSpotFilterChange={setSpotFilter}
      centered={!floatsOverMap}
    />
  );

  return (
    <CollectionsContext.Provider value={contextValue}>
      {floatsOverMap
        ? <SidePanelHeaderTrailing>{toolbar}</SidePanelHeaderTrailing>
        : <PanelLayoutStickyChrome>{toolbar}</PanelLayoutStickyChrome>}
      <SidePanelFloating>
        <CollectionsSectionBar
          activeTab={activeTab ?? 'uploads'}
          avoidDrawer={floatsOverMap}
          onTabChange={handleTabChange}
        />
      </SidePanelFloating>
      <Outlet />
    </CollectionsContext.Provider>
  );
}
