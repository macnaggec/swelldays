import { createRootRouteWithContext, Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Center, Stack, Text, Title } from '@mantine/core';
import { useLayoutEffect, useRef } from 'react';
import { AppShell } from 'app/AppShell';
import { AuthModalProvider } from 'features/Auth';
import { AddSpotProvider, useAddSpotStore } from 'features/AddSpot';
import { useCartSessionSync } from 'features/Cart';
import { FirstVisitGate } from 'features/FirstVisit';
import classes from './__root.module.css';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { BrowseSurfaceProvider } from 'shared/ui/DrawerShell';
import { useUser } from 'shared/hooks/useUser';
import { AppButton } from 'shared/ui/AppButton';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});

function RootLayout() {
  useQueryCacheSessionSync();
  useCartSessionSync();
  const { isAuthenticated, isLoading: isSessionLoading } = useUser();

  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const matches = useMatches();
  const isFirstVisitEligibleRoute = matches.some((match) => match.routeId === '/_panel/');
  const routeIntent = resolveAppRouteIntent(
    matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const browseExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const galleryExpanded = usePanelExpansionStore((state) => state.galleryExpanded);
  const setBrowseExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const sheetPreferredExpanded = routeIntent === 'galleryWorkspace'
    ? galleryExpanded
    : browseExpanded;
  const setSheetPreferredExpanded = routeIntent === 'galleryWorkspace'
    ? setGalleryExpanded
    : setBrowseExpanded;

  return (
    <AuthModalProvider>
      <AddSpotProvider>
        <AppShellLayoutPolicyProvider
          routeIntent={routeIntent}
          browseExpanded={browseExpanded}
          galleryExpanded={galleryExpanded}
        >
          <BrowseSurfaceProvider
            preferredExpanded={sheetPreferredExpanded}
            onPreferredExpandedChange={setSheetPreferredExpanded}
          >
            <FirstVisitGate
              isEligibleRoute={isFirstVisitEligibleRoute}
              isSessionLoading={isSessionLoading}
              isAuthenticated={isAuthenticated}
            >
              <AppShell>
                <Outlet />
              </AppShell>
            </FirstVisitGate>
          </BrowseSurfaceProvider>
        </AppShellLayoutPolicyProvider>
      </AddSpotProvider>
    </AuthModalProvider>
  );
}

function useQueryCacheSessionSync() {
  const queryClient = useQueryClient();
  const { user, isLoading } = useUser();
  const currentUserId = user?.id ?? null;
  const previousUserIdRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    if (isLoading) return;

    const previousUserId = previousUserIdRef.current;
    if (previousUserId !== undefined && previousUserId !== currentUserId) {
      // Cached server projections belong to the identity that fetched them. A
      // principal change invalidates that ownership boundary before child UI paints.
      queryClient.clear();
    }
    previousUserIdRef.current = currentUserId;
  }, [currentUserId, isLoading, queryClient]);
}

function RootError({ error }: { error: Error }) {
  const navigate = useNavigate();
  return (
    <Center className={classes.overlay}>
      <Stack align="center" gap="sm" maw={400} ta="center" p="xl">
        <Title order={3} c="white">Something went wrong</Title>
        <Text c="dimmed" size="sm">{getErrorMessage(error)}</Text>
        <AppButton tone="highlight" onClick={() => navigate({ to: '/' })}>Go home</AppButton>
      </Stack>
    </Center>
  );
}

function RootNotFound() {
  const navigate = useNavigate();
  return (
    <Center className={classes.overlay}>
      <Stack align="center" gap="sm" maw={400} ta="center" p="xl">
        <Title order={3} c="white">Page not found</Title>
        <Text c="dimmed" size="sm">The page you're looking for doesn't exist.</Text>
        <AppButton tone="highlight" onClick={() => navigate({ to: '/' })}>Go home</AppButton>
      </Stack>
    </Center>
  );
}
