import { createContext, useContext, useMemo, useState } from 'react';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTabNavigation } from 'shared/hooks';
import { useTRPC } from 'shared/lib/trpc';
import type { SurfSessionItem } from 'entities/SurfSession';
import { CollectionsToolbar } from 'features/Collections';
import { PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';

const TAB_ROUTES = {
  uploads: '/me/collections',
  purchases: '/me/collections/purchases',
  favorites: '/me/collections/favorites',
} as const;

type CollectionsContextValue = {
  sessions: SurfSessionItem[];
  visibleUploads: SurfSessionItem[];
  isLoadingUploads: boolean;
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
  const { activeTab, handleTabChange } = useTabNavigation(TAB_ROUTES);
  const { data: sessions = [], isLoading: isLoadingUploads } = useQuery({
    ...trpc.sessions.mine.queryOptions(),
    enabled: activeTab === 'uploads',
  });
  const [spotFilter, setSpotFilter] = useState<string | null>(null);

  const spotOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const session of sessions) {
      if (!seen.has(session.spot.id)) seen.set(session.spot.id, session.spot.name);
    }

    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [sessions]);

  const visibleUploads = useMemo(
    () => (spotFilter ? sessions.filter((session) => session.spot.id === spotFilter) : sessions),
    [sessions, spotFilter],
  );

  const contextValue = useMemo(
    () => ({ sessions, visibleUploads, isLoadingUploads }),
    [sessions, visibleUploads, isLoadingUploads],
  );

  const toolbar = (
    <CollectionsToolbar
      activeTab={activeTab ?? 'uploads'}
      spotOptions={spotOptions}
      spotFilter={spotFilter}
      onSpotFilterChange={setSpotFilter}
      onTabChange={handleTabChange}
    />
  );

  return (
    <CollectionsContext.Provider value={contextValue}>
      <PanelLayoutStickyChrome>{toolbar}</PanelLayoutStickyChrome>
      <Outlet />
    </CollectionsContext.Provider>
  );
}
