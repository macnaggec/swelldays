import type { AppRouteIntent } from 'shared/model/appRouteIntent';

export type GlobeSceneMode =
  | { kind: 'overview' }
  | { kind: 'spotFocused'; spotId: string }
  | { kind: 'addSpotFlow' }
  | { kind: 'uploadSpotSelection' }
  | { kind: 'userExploring' };

export interface GlobeSceneModeInput {
  routeIntent: AppRouteIntent;
  selectedSpotId: string | null;
  isUserExploring: boolean;
}

export function deriveGlobeSceneMode({
  routeIntent,
  selectedSpotId,
  isUserExploring,
}: GlobeSceneModeInput): GlobeSceneMode {
  if (routeIntent === 'immersiveMapInput') return { kind: 'addSpotFlow' };
  if (routeIntent === 'mapInput') return { kind: 'uploadSpotSelection' };
  if (selectedSpotId) return { kind: 'spotFocused', spotId: selectedSpotId };
  if (isUserExploring) return { kind: 'userExploring' };
  return { kind: 'overview' };
}
