import { createFileRoute, Outlet, useMatches, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useSelectedSpot, useSpotPreview } from 'entities/Spot';
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { useTRPC } from 'shared/lib/trpc';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';
import { Loader, Skeleton, Text, Title } from '@mantine/core';
import {
  type SurfSessionItem,
} from 'entities/SurfSession';
import { EMPTY_BROWSE_FILTERS, type BrowseDateFilter, type BrowseFilters } from 'shared/model/browseFilters';
import { SidePanel } from 'widgets/SidePanel';
import { useCartStore } from 'entities/Commerce';
import { CartDrawerHeader } from 'features/Cart';
import { useUploadStore } from 'features/Upload';
import { useAddSpotStore } from 'features/AddSpot';
import { ScopeSwitcher } from 'widgets/SidePanel';
import { FeedSearch } from 'widgets/FeedDrawer';
import { FilterPills } from 'widgets/SidePanel';
import {
  FloatingPanelControls,
  PanelRouteActionButton,
  PanelSearchToolbar,
} from 'shared/ui/PanelRouteLayout';
import { formatDateRange } from 'shared/lib/dateUtils';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'features/Auth';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { deriveDesktopFoundationAppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { deriveRenderedPanelState } from 'shared/model/panelLayoutPolicy';

// ─── Contexts — shared with child routes ─────────────────────────────────────

interface PanelFilterCtx {
  filters: BrowseFilters;
  setDateFilter: (date: BrowseDateFilter) => void;
  setFavoriteSpotsOnly: (value: boolean) => void;
  clearFilters: () => void;
}

interface PanelRouteBackAction {
  /** Omitted for a chevron-only back control. */
  label?: string;
  onBack: () => void;
  disabled?: boolean;
}

const PanelFilterContext = createContext<PanelFilterCtx>({
  filters: EMPTY_BROWSE_FILTERS,
  setDateFilter: () => { },
  setFavoriteSpotsOnly: () => { },
  clearFilters: () => { },
});

const PanelExpandedContext = createContext(false);
const PanelFeedLayoutReadyContext = createContext<(ready: boolean) => void>(() => { });
const PanelRouteBackActionContext = createContext<(action: PanelRouteBackAction | null) => void>(() => { });

export function usePanelFilter() {
  return useContext(PanelFilterContext);
}

export function usePanelExpanded() {
  return useContext(PanelExpandedContext);
}

export function usePanelFeedLayoutReadyChange() {
  return useContext(PanelFeedLayoutReadyContext);
}

export function useSetPanelRouteBackAction() {
  return useContext(PanelRouteBackActionContext);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/_panel')({
  staticData: { appRouteIntent: 'browse' },
  component: PanelLayout,
});

function PanelLayout() {
  const [filters, setFilters] = useState<BrowseFilters>(EMPTY_BROWSE_FILTERS);
  const setDateFilter = useCallback((date: BrowseDateFilter) => {
    setFilters((current) => ({ ...current, date }));
  }, []);
  const setFavoriteSpotsOnly = useCallback((favoriteSpotsOnly: boolean) => {
    setFilters((current) => ({ ...current, favoriteSpotsOnly }));
  }, []);
  const clearFilters = useCallback(() => setFilters(EMPTY_BROWSE_FILTERS), []);
  return (
    <PanelFilterContext.Provider value={{ filters, setDateFilter, setFavoriteSpotsOnly, clearFilters }}>
      <PanelFrame>
        <Outlet />
      </PanelFrame>
    </PanelFilterContext.Provider>
  );
}

function PanelFrame({ children }: { children: ReactNode }) {
  const userPreferredExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const galleryPreferredExpanded = usePanelExpansionStore((state) => state.galleryExpanded);
  const setUserPreferredExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryPreferredExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const [routeBackAction, setRouteBackAction] = useState<PanelRouteBackAction | null>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const matches = useMatches();
  const { filters, setDateFilter, setFavoriteSpotsOnly } = usePanelFilter();

  const cartItems = useCartStore((state) => state.items);
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();
  const trpc = useTRPC();
  const { data: activeWorkspace } = useQuery({
    ...trpc.uploads.getActiveWorkspace.queryOptions(),
    enabled: isAuthenticated,
  });
  const hasUnfinishedUpload = activeWorkspace?.kind === 'NEW_SESSION';
  const hasActiveTransfers = useUploadStore((s) => s.transfers.size > 0);
  const isAddSpotActive = useAddSpotStore((s) => s.isActive);
  const appRouteIntent = resolveAppRouteIntent(
    matches,
    isAddSpotActive ? 'immersiveMapInput' : undefined,
  );
  const layoutPolicy = deriveDesktopFoundationAppShellLayoutPolicy({
    routeIntent: appRouteIntent,
    preferences: {
      browseExpanded: userPreferredExpanded,
      galleryExpanded: galleryPreferredExpanded,
    },
  });

  const cartMatch = matches.find((match) => match.routeId === '/_panel/cart');
  const spotMatch = matches.find((match) => match.routeId === '/_panel/$spotId');
  const uploadMatch = matches.find((match) => match.routeId === '/_panel/upload');
  const spotGalleryMatch = matches.find((match) => match.routeId === '/_panel/$spotId/gallery');
  const allGalleryMatch = matches.find((match) => match.routeId === '/_panel/gallery');
  const galleryMatch = spotGalleryMatch ?? allGalleryMatch;
  const sessionDetailMatch = matches.find((match) => match.routeId === '/_panel/$spotId/session/$sessionId');
  const cameFromCollections = (sessionDetailMatch?.search as { from?: string } | undefined)?.from === 'collections';
  const isDefaultIndex = matches.some((match) => match.routeId === '/_panel/');
  const showsBrowseResults = isDefaultIndex || Boolean(spotMatch && !sessionDetailMatch) || Boolean(allGalleryMatch);

  const handleFavoritesChange = useCallback((value: boolean) => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    setFavoriteSpotsOnly(value);
  }, [isAuthenticated, openAuthModal, setFavoriteSpotsOnly]);

  const cartFrom = cartMatch
    ? (cartMatch.search as { from?: string }).from
    : undefined;

  const { spotId } = useParams({ strict: false });

  const handleUpload = useCallback(() => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    void navigate({
      to: '/upload',
      search: activeWorkspace
        ? { workspaceId: activeWorkspace.id }
        : { spotId: spotId ?? undefined },
    });
  }, [activeWorkspace, isAuthenticated, navigate, openAuthModal, spotId]);

  const { spot: activeSpot } = useSelectedSpot();
  const { data: cartFromSpot } = useSpotPreview(cartFrom ?? '', { enabled: !!cartFrom });

  const routeRequiresCompactMapInput = appRouteIntent === 'mapInput';
  const targetExpanded = layoutPolicy.drawer.state === 'expanded';

  const canWaitForFeedLayout = layoutPolicy.drawer.canWaitForContent;
  const handlePanelExpandToggle = layoutPolicy.drawer.control === 'expandCollapse'
    ? () => {
      if (appRouteIntent === 'galleryWorkspace') {
        setGalleryPreferredExpanded(!galleryPreferredExpanded);
      } else {
        setUserPreferredExpanded(!userPreferredExpanded);
      }
    }
    : undefined;

  const [isExpanded, setIsExpanded] = useState(() => deriveRenderedPanelState({
    targetExpanded,
    targetReason: appRouteIntent,
    isFeedLayoutReady: false,
    canWaitForFeedLayout,
    currentRenderedExpanded: false,
  }).expanded);
  const [feedLayoutReady, setFeedLayoutReady] = useState(false);
  const handleFeedLayoutReadyChange = useCallback((ready: boolean) => setFeedLayoutReady(ready), []);
  const renderedPanelState = deriveRenderedPanelState({
    targetExpanded,
    targetReason: appRouteIntent,
    isFeedLayoutReady: feedLayoutReady,
    canWaitForFeedLayout,
    currentRenderedExpanded: isExpanded,
  });

  useLayoutEffect(() => {
    if (isExpanded === renderedPanelState.expanded) return;
    const frame = requestAnimationFrame(() => setIsExpanded(renderedPanelState.expanded));
    return () => cancelAnimationFrame(frame);
  }, [isExpanded, renderedPanelState.expanded]);

  const header: ReactNode = (() => {
    if (cartMatch) {
      return (
        <CartDrawerHeader
          itemCount={cartItems.length}
          spotName={cartFrom && cartFromSpot ? cartFromSpot.name : undefined}
          onBack={
            cartFrom
              ? () => void navigate({ to: '/$spotId', params: { spotId: cartFrom } })
              : () => void navigate({ to: '/' })
          }
        />
      );
    }

    if (sessionDetailMatch) {
      const session = sessionDetailMatch.loaderData as SurfSessionItem | null;
      if (!session) return <Skeleton height={22} width={160} radius="sm" />;
      return (
        <Text size="xs" c="dimmed" truncate>
          {formatDateRange(session.startsAt, session.endsAt)}
        </Text>
      );
    }

    if (spotMatch || allGalleryMatch || isDefaultIndex) {
      return (
        <ScopeSwitcher
          scope={galleryMatch ? 'gallery' : 'sessions'}
          onChange={(scope) => {
            if (allGalleryMatch || isDefaultIndex) {
              if (scope === 'sessions') {
                setUserPreferredExpanded(isExpanded);
                void navigate({ to: '/' });
              } else {
                setGalleryPreferredExpanded(isExpanded);
                void navigate({ to: '/gallery' });
              }
              return;
            }

            if (scope === 'gallery') {
              setGalleryPreferredExpanded(isExpanded);
              void navigate({ to: '/$spotId/gallery', params: { spotId: spotId! } });
            } else {
              setUserPreferredExpanded(isExpanded);
              void navigate({ to: '/$spotId', params: { spotId: spotId! } });
            }
          }}
        />
      );
    }

    if (uploadMatch) {
      return <Title order={1} size="h4">{activeWorkspace?.kind === 'SESSION_EDIT' ? 'Edit session' : 'Upload'}</Title>;
    }

    for (const match of [...matches].reverse()) {
      const panelHeader = (match.staticData as { panelHeader?: string }).panelHeader;
      if (panelHeader) return <Title order={1} size="h4">{panelHeader}</Title>;
    }

    return undefined;
  })();

  const subheader: ReactNode = (() => {
    if (sessionDetailMatch || (!spotMatch && !isDefaultIndex && !allGalleryMatch)) return undefined;

    return (
      <PanelSearchToolbar
        expanded={isExpanded}
        primary={(
          <FeedSearch
            activeSpot={isDefaultIndex || allGalleryMatch ? null : (activeSpot ?? null)}
            onSpotSelect={
              isDefaultIndex
                ? (isExpanded
                  ? (spot) => void navigate({ to: '/$spotId', params: { spotId: spot.id } })
                  : undefined)
                : allGalleryMatch
                  ? (spot) => void navigate({
                    to: '/$spotId/gallery',
                    params: { spotId: spot.id },
                  })
                : spotMatch
                  ? (spot) => void navigate({
                    to: spotGalleryMatch ? '/$spotId/gallery' : '/$spotId',
                    params: { spotId: spot.id },
                  })
                  : undefined
            }
            onClear={
              spotMatch
                ? () => void navigate({ to: spotGalleryMatch ? '/gallery' : '/' })
                : undefined
            }
          />
        )}
        action={(
          <PanelRouteActionButton
            onClick={handleUpload}
            showIndicator={hasUnfinishedUpload}
          >
            {hasActiveTransfers ? (
              <>
                <Loader size={10} color="gray" />
                Upload
              </>
            ) : 'Upload'}
          </PanelRouteActionButton>
        )}
        trailing={isExpanded ? (
          <>
            <FilterPills
              active={filters.date}
              onChange={setDateFilter}
              favoritesOnly={filters.favoriteSpotsOnly}
              onFavoritesChange={showsBrowseResults ? handleFavoritesChange : undefined}
            />
          </>
        ) : undefined}
      />
    );
  })();

  const routeBackActionForPanel = uploadMatch ? routeBackAction : null;
  const defaultBackAction = layoutPolicy.drawer.control !== 'routeBack' || cartMatch || galleryMatch || routeRequiresCompactMapInput
    ? undefined
    : appRouteIntent === 'routeWorkspace'
      ? () => {
        if (sessionDetailMatch && router.history.canGoBack()) router.history.back();
        else if (cameFromCollections) void navigate({ to: '/me/collections' });
        else void navigate({ to: '/' });
      }
      : undefined;
  const defaultBackLabel = sessionDetailMatch
    ? (cameFromCollections ? 'Back to uploads' : 'Back to feed')
    : undefined;

  return (
    <PanelRouteBackActionContext.Provider value={setRouteBackAction}>
      <PanelFeedLayoutReadyContext.Provider value={handleFeedLayoutReadyChange}>
        <PanelExpandedContext.Provider value={isExpanded}>
          {/* Compact-mode filter pills — float on the map beside the panel */}
          {layoutPolicy.chrome.panelControls === 'adjacent' && (spotMatch || isDefaultIndex || allGalleryMatch) && !isExpanded && (
            <FloatingPanelControls>
              <FilterPills
                active={filters.date}
                onChange={setDateFilter}
                favoritesOnly={filters.favoriteSpotsOnly}
                onFavoritesChange={showsBrowseResults ? handleFavoritesChange : undefined}
              />
            </FloatingPanelControls>
          )}
          {layoutPolicy.drawer.presentation !== 'hidden' && (
            <SidePanel
              drawerPresentation={layoutPolicy.drawer.presentation}
              drawerModality={layoutPolicy.drawer.modality === 'modal' ? 'modal' : 'nonmodal'}
              expanded={isExpanded}
              onExpandToggle={handlePanelExpandToggle}
              onBack={routeBackActionForPanel?.onBack ?? defaultBackAction}
              backLabel={routeBackActionForPanel?.label ?? defaultBackLabel}
              backDisabled={routeBackActionForPanel?.disabled}
              headerFullWidth={Boolean(cartMatch)}
              header={header}
              subheader={subheader}
              hideSubheaderOnScroll={Boolean(subheader && (spotMatch || isDefaultIndex || allGalleryMatch))}
            >
              {children}
            </SidePanel>
          )}
        </PanelExpandedContext.Provider>
      </PanelFeedLayoutReadyContext.Provider>
    </PanelRouteBackActionContext.Provider>
  );
}
