import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTabNavigation } from 'shared/hooks';
import { useTRPC } from 'shared/lib/trpc';
import type { SurfSessionItem } from 'entities/SurfSession';
import type { PublicMedia } from 'shared/types/media';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { CollectionsSectionBar, CollectionsToolbar, isCollectionTab, type CollectionTab } from 'features/Collections';
import { SidePanelHeaderTrailing } from 'widgets/SidePanel';
import { AppNavigationFloating, AppNavigationSupplement } from 'widgets/AppNavigation';
import { PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';

const TAB_ROUTES: Record<CollectionTab, string> = {
  uploads: '/me/collections',
  purchases: '/me/collections/purchases',
  favorites: '/me/collections/favorites',
};

type CollectionsContextValue = {
  sessions: SurfSessionItem[];
  visibleUploads: SurfSessionItem[];
  isLoadingUploads: boolean;
  favorites: PublicMedia[];
  visibleFavorites: PublicMedia[];
  isLoadingFavorites: boolean;
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
  const floatsOverMap = layoutPolicy.drawer.presentation === 'sideWorkspace';
  // Same split CollectionsSectionBar uses for its own presentation: landscape
  // mobile docks the switcher into the account/cart rail; every other band
  // floats it as its own independent pill instead.
  const SectionBarPortal = layoutPolicy.navigation === 'compactBar'
    ? AppNavigationSupplement
    : AppNavigationFloating;
  const { activeTab: rawActiveTab, handleTabChange } = useTabNavigation(TAB_ROUTES);
  const activeTab: CollectionTab = rawActiveTab && isCollectionTab(rawActiveTab) ? rawActiveTab : 'uploads';
  const { data: sessions = [], isLoading: isLoadingUploads } = useQuery({
    ...trpc.sessions.mine.queryOptions(),
    enabled: activeTab === 'uploads',
  });
  const { data: favorites = [], isLoading: isLoadingFavorites } = useQuery({
    ...trpc.media.favorites.queryOptions(),
    enabled: activeTab === 'favorites',
  });
  const [spotFilter, setSpotFilter] = useState<string | null>(null);

  const handleCollectionTabChange = useCallback(
    (tab: CollectionTab) => {
      setSpotFilter(null);
      handleTabChange(tab);
    },
    [handleTabChange],
  );

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

  // A spot ID selected on another tab, or on this tab before its data changed
  // underneath it, may no longer be one of this tab's own options — reject it
  // rather than filtering against a spot the current collection doesn't have.
  const validSpotFilter = useMemo(
    () => (spotFilter && spotOptions.some((option) => option.value === spotFilter) ? spotFilter : null),
    [spotFilter, spotOptions],
  );

  const visibleUploads = useMemo(
    () => (validSpotFilter ? sessions.filter((session) => session.spot.id === validSpotFilter) : sessions),
    [sessions, validSpotFilter],
  );

  const visibleFavorites = useMemo(
    () => (validSpotFilter ? favorites.filter((item) => item.spot?.id === validSpotFilter) : favorites),
    [favorites, validSpotFilter],
  );

  const contextValue = useMemo(
    () => ({
      sessions,
      visibleUploads,
      isLoadingUploads,
      favorites,
      visibleFavorites,
      isLoadingFavorites,
    }),
    [sessions, visibleUploads, isLoadingUploads, favorites, visibleFavorites, isLoadingFavorites],
  );

  const toolbar = (
    <CollectionsToolbar
      activeTab={activeTab}
      spotOptions={spotOptions}
      spotFilter={validSpotFilter}
      onSpotFilterChange={setSpotFilter}
      centered={!floatsOverMap}
    />
  );

  return (
    <CollectionsContext.Provider value={contextValue}>
      {floatsOverMap
        ? <SidePanelHeaderTrailing>{toolbar}</SidePanelHeaderTrailing>
        : <PanelLayoutStickyChrome spacing="flush">{toolbar}</PanelLayoutStickyChrome>}
      <SectionBarPortal>
        <CollectionsSectionBar
          activeTab={activeTab}
          onTabChange={handleCollectionTabChange}
        />
      </SectionBarPortal>
      <Outlet />
    </CollectionsContext.Provider>
  );
}
