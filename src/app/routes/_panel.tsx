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
import { useBrowseSurface, type SheetSnap } from 'shared/ui/DrawerShell';
import { useCartStore } from 'entities/Commerce';
import { CartDrawerHeader } from 'features/Cart';
import { useUploadStore } from 'features/Upload';
import { useAddSpotStore } from 'features/AddSpot';
import { ScopeSwitcher } from 'widgets/SidePanel';
import { FeedSearch } from 'widgets/FeedDrawer';
import { FilterPills } from 'widgets/SidePanel';
import {
  FloatingPanelSearchToolbar,
  FloatingPanelControls,
  PanelRouteActionButton,
  PanelSearchToolbar,
} from 'shared/ui/PanelRouteLayout';
import { formatDateRange } from 'shared/lib/dateUtils';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'features/Auth';
import { resolveAppRouteIntent } from 'shared/model/appRouteIntent';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { deriveRenderedPanelState } from 'shared/model/panelLayoutPolicy';
import { BrowseSectionBar, type BrowseSection } from 'widgets/BrowseSectionBar';

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

const UPLOAD_SHEET_SNAPS: readonly SheetSnap[] = ['peek', 'full'];

function PanelFrame({ children }: { children: ReactNode }) {
  const userPreferredExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const galleryPreferredExpanded = usePanelExpansionStore((state) => state.galleryExpanded);
  const setUserPreferredExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const setGalleryPreferredExpanded = usePanelExpansionStore((state) => state.setGalleryPanelExpanded);
  const [routeBackAction, setRouteBackAction] = useState<PanelRouteBackAction | null>(null);
  const [uploadSheetSnap, setUploadSheetSnap] = useState<SheetSnap>('full');
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
  const layoutPolicy = useAppShellLayoutPolicy();

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
    const submit = () => setFavoriteSpotsOnly(value);
    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: submit });
      return;
    }
    submit();
  }, [isAuthenticated, openAuthModal, setFavoriteSpotsOnly]);

  const cartFrom = cartMatch
    ? (cartMatch.search as { from?: string }).from
    : undefined;

  const { spotId } = useParams({ strict: false });

  const handleUpload = useCallback(() => {
    // The workspace query is gated on authentication, so a visitor signing in
    // here has no draft loaded yet. Landing on /upload without a workspaceId is
    // correct: the upload route resolves the active draft itself and replaces
    // the location once that query settles.
    const submit = () => {
      void navigate({
        to: '/upload',
        search: activeWorkspace
          ? { workspaceId: activeWorkspace.id }
          : { spotId: spotId ?? undefined },
      });
    };
    if (!isAuthenticated) {
      openAuthModal({ onAuthenticated: submit });
      return;
    }
    submit();
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

  const {
    mode: browseSurfaceMode,
    snap: sheetSnap,
    setSnap: handleSheetSnapChange,
    showMap: showBrowseMap,
    showResults: revealBrowseResults,
  } = useBrowseSurface();
  const isBrowseSheet = layoutPolicy.drawer.presentation === 'bottomSheet'
    && (appRouteIntent === 'browse' || appRouteIntent === 'galleryWorkspace');
  const isUploadSheet = layoutPolicy.drawer.presentation === 'bottomSheet'
    && appRouteIntent === 'mapInput';
  const isBrowseSectionRoute = Boolean(spotMatch || allGalleryMatch || isDefaultIndex);
  const isShortBrowseSideOverlay = layoutPolicy.drawer.presentation === 'sideOverlay'
    && isBrowseSectionRoute;
  const showsStandaloneMapToolbar = isShortBrowseSideOverlay && browseSurfaceMode === 'map';
  const usesFloatingBrowseSections = isBrowseSheet || isShortBrowseSideOverlay;
  const renderedExpanded = isBrowseSheet
    ? sheetSnap !== 'peek'
    : isShortBrowseSideOverlay
      ? browseSurfaceMode === 'results'
      : isExpanded;

  const handleBrowseSectionChange = useCallback((scope: BrowseSection) => {
    revealBrowseResults();

    if (allGalleryMatch || isDefaultIndex) {
      if (
        (scope === 'sessions' && isDefaultIndex)
        || (scope === 'gallery' && allGalleryMatch)
      ) return;

      if (scope === 'sessions') {
        if (!isBrowseSheet) setUserPreferredExpanded(renderedExpanded);
        void navigate({ to: '/' });
      } else {
        if (!isBrowseSheet) setGalleryPreferredExpanded(renderedExpanded);
        void navigate({ to: '/gallery' });
      }
      return;
    }

    if (
      (scope === 'sessions' && !galleryMatch)
      || (scope === 'gallery' && Boolean(galleryMatch))
    ) return;

    if (scope === 'gallery') {
      if (!isBrowseSheet) setGalleryPreferredExpanded(renderedExpanded);
      void navigate({ to: '/$spotId/gallery', params: { spotId: spotId! } });
    } else {
      if (!isBrowseSheet) setUserPreferredExpanded(renderedExpanded);
      void navigate({ to: '/$spotId', params: { spotId: spotId! } });
    }
  }, [
    allGalleryMatch,
    isDefaultIndex,
    isBrowseSheet,
    galleryMatch,
    navigate,
    renderedExpanded,
    setGalleryPreferredExpanded,
    setUserPreferredExpanded,
    revealBrowseResults,
    spotId,
  ]);

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
      if (usesFloatingBrowseSections) return undefined;
      return (
        <ScopeSwitcher
          scope={galleryMatch ? 'gallery' : 'sessions'}
          onChange={handleBrowseSectionChange}
        />
      );
    }

    if (uploadMatch) {
      return <Title order={1} size="h6">{activeWorkspace?.kind === 'SESSION_EDIT' ? 'Edit session' : 'Upload'}</Title>;
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
        expanded={renderedExpanded}
        primary={(
          <FeedSearch
            activeSpot={isDefaultIndex || allGalleryMatch ? null : (activeSpot ?? null)}
            onSpotSelect={(spot) => {
              revealBrowseResults();
              // The scope the photographer was already in owns spot selection: picking
              // a spot from the gallery stays in the gallery, filtered to that spot;
              // picking one from sessions stays in sessions. Only the scopeless
              // default index has nothing to preserve.
              if (!isDefaultIndex && (allGalleryMatch || spotGalleryMatch)) {
                void navigate({ to: '/$spotId/gallery', params: { spotId: spot.id } });
              } else {
                void navigate({ to: '/$spotId', params: { spotId: spot.id } });
              }
            }}
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
        trailing={renderedExpanded ? (
          <>
            <FilterPills
              active={filters.date}
              onChange={setDateFilter}
              favoritesOnly={filters.favoriteSpotsOnly}
              onFavoritesChange={showsBrowseResults ? handleFavoritesChange : undefined}
              horizontalScroll={usesFloatingBrowseSections}
            />
          </>
        ) : undefined}
      />
    );
  })();

  const routeBackActionForPanel = uploadMatch ? routeBackAction : null;
  const defaultBackAction = layoutPolicy.drawer.control !== 'routeBack' || cartMatch || galleryMatch || routeRequiresCompactMapInput
    ? undefined
    : (appRouteIntent === 'routeWorkspace' || appRouteIntent === 'siteWorkspace')
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
        <PanelExpandedContext.Provider value={renderedExpanded}>
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
          {showsStandaloneMapToolbar && subheader && (
            <FloatingPanelSearchToolbar>
              {subheader}
            </FloatingPanelSearchToolbar>
          )}
          {layoutPolicy.drawer.presentation !== 'hidden' && appRouteIntent !== 'immersiveMapInput' && (
            <SidePanel
              drawerPresentation={layoutPolicy.drawer.presentation}
              drawerModality={layoutPolicy.drawer.modality === 'modal' ? 'modal' : 'nonmodal'}
              navigation={layoutPolicy.navigation}
              open={!showsStandaloneMapToolbar}
              sheetSnap={isBrowseSheet ? sheetSnap : isUploadSheet ? uploadSheetSnap : undefined}
              onSheetSnapChange={isBrowseSheet ? handleSheetSnapChange : isUploadSheet ? setUploadSheetSnap : undefined}
              sheetPeekIncludesHeader={isUploadSheet}
              sheetAvailableSnaps={isUploadSheet ? UPLOAD_SHEET_SNAPS : undefined}
              expanded={renderedExpanded}
              onExpandToggle={handlePanelExpandToggle}
              onBack={routeBackActionForPanel?.onBack ?? defaultBackAction}
              backLabel={routeBackActionForPanel?.label ?? defaultBackLabel}
              backDisabled={routeBackActionForPanel?.disabled}
              headerFullWidth={Boolean(cartMatch)}
              header={header}
              subheader={showsStandaloneMapToolbar ? undefined : subheader}
              bottomBar={
                usesFloatingBrowseSections
                && (!isBrowseSheet || sheetSnap !== 'peek') ? (
                <BrowseSectionBar
                  active={
                    browseSurfaceMode === 'map'
                      ? 'map'
                      : galleryMatch
                        ? 'gallery'
                        : 'sessions'
                  }
                  avoidDrawer={isShortBrowseSideOverlay && browseSurfaceMode !== 'map'}
                  onMap={showBrowseMap}
                  onSectionChange={handleBrowseSectionChange}
                />
                  ) : undefined
              }
            >
              {children}
            </SidePanel>
          )}
        </PanelExpandedContext.Provider>
      </PanelFeedLayoutReadyContext.Provider>
    </PanelRouteBackActionContext.Provider>
  );
}
