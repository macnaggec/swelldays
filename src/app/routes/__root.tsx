import { createRootRouteWithContext, Outlet, useMatches, useNavigate } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { AppShell } from 'app/AppShell';
import { AuthModalProvider } from 'features/Auth';
import { AddSpotProvider, useAddSpotStore } from 'features/AddSpot';
import { useCartSessionSync } from 'features/Cart';
import classes from './__root.module.css';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { BrowseSheetPositionProvider } from 'shared/ui/DrawerShell';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});

function RootLayout() {
  useCartSessionSync();

  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const matches = useMatches();
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
          <BrowseSheetPositionProvider
            preferredExpanded={sheetPreferredExpanded}
            onPreferredExpandedChange={setSheetPreferredExpanded}
          >
            <AppShell />
            <Outlet />
          </BrowseSheetPositionProvider>
        </AppShellLayoutPolicyProvider>
      </AddSpotProvider>
    </AuthModalProvider>
  );
}

function RootError({ error }: { error: Error }) {
  const navigate = useNavigate();
  return (
    <Center className={classes.overlay}>
      <Stack align="center" gap="sm" maw={400} ta="center" p="xl">
        <Title order={3} c="white">Something went wrong</Title>
        <Text c="dimmed" size="sm">{getErrorMessage(error)}</Text>
        <Button onClick={() => navigate({ to: '/' })}>Go home</Button>
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
        <Button onClick={() => navigate({ to: '/' })}>Go home</Button>
      </Stack>
    </Center>
  );
}
