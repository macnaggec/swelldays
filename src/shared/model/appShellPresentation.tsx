import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import type { AppRouteIntent } from './appRouteIntent';
import {
  deriveAppShellLayoutPolicy,
  type AppShellLayoutPolicy,
  type AppShellLayoutPreferences,
} from './appShellLayoutPolicy';
import { useViewportCapabilities, type ViewportCapabilities } from './viewportCapabilities';

export interface ActivationCell {
  readonly sizeBand: ViewportCapabilities['sizeBand'];
  readonly heightBand: ViewportCapabilities['heightBand'];
  readonly routeIntent: AppRouteIntent;
}

const WIDE_FALLBACK = { sizeBand: 'wide', heightBand: 'regular' } as const;

/**
 * The size/height/route cells whose complete navigation/drawer/map/chrome lifecycle is
 * actually implemented and mounted today. A cell is listed only once every part of that
 * lifecycle exists — Phase M and Phase T tasks each add cells as they mount them.
 * Navigation is never activated separately from the surface beneath it: both come from
 * the same cell. D01 deletes this matrix and the `WIDE_FALLBACK` it gates once every
 * band is mounted.
 */
const ACTIVE_CELLS: readonly ActivationCell[] = [
  { sizeBand: 'compact', heightBand: 'regular', routeIntent: 'browse' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'browse' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'galleryWorkspace' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'routeWorkspace' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'mapInput' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'fullPage' },
  { sizeBand: 'wide', heightBand: 'regular', routeIntent: 'immersiveMapInput' },
];

export function isCellActive(cell: ActivationCell): boolean {
  return ACTIVE_CELLS.some((activeCell) => (
    activeCell.sizeBand === cell.sizeBand
    && activeCell.heightBand === cell.heightBand
    && activeCell.routeIntent === cell.routeIntent
  ));
}

export function resolveShellLayoutPolicy(input: {
  routeIntent: AppRouteIntent;
  sizeBand: ViewportCapabilities['sizeBand'];
  heightBand: ViewportCapabilities['heightBand'];
  preferences: AppShellLayoutPreferences;
}): AppShellLayoutPolicy {
  const { routeIntent, sizeBand, heightBand, preferences } = input;
  const active = isCellActive({ sizeBand, heightBand, routeIntent });
  const resolvedBands = active ? { sizeBand, heightBand } : WIDE_FALLBACK;

  return deriveAppShellLayoutPolicy({ routeIntent, ...resolvedBands, preferences });
}

const AppShellLayoutPolicyContext = createContext<AppShellLayoutPolicy | null>(null);

export function AppShellLayoutPolicyProvider(props: {
  routeIntent: AppRouteIntent;
  browseExpanded: boolean;
  galleryExpanded: boolean;
  children: ReactNode;
}): ReactElement {
  const { routeIntent, browseExpanded, galleryExpanded, children } = props;
  const { sizeBand, heightBand } = useViewportCapabilities();

  const policy = useMemo(
    () => resolveShellLayoutPolicy({
      routeIntent,
      sizeBand,
      heightBand,
      preferences: { browseExpanded, galleryExpanded },
    }),
    [routeIntent, sizeBand, heightBand, browseExpanded, galleryExpanded],
  );

  return (
    <AppShellLayoutPolicyContext.Provider value={policy}>
      {children}
    </AppShellLayoutPolicyContext.Provider>
  );
}

export function useAppShellLayoutPolicy(): AppShellLayoutPolicy {
  const policy = useContext(AppShellLayoutPolicyContext);
  if (!policy) {
    throw new Error('useAppShellLayoutPolicy must be used within AppShellLayoutPolicyProvider');
  }
  return policy;
}
