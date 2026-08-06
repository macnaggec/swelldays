export type AppRouteIntent =
  | 'browse'
  | 'galleryWorkspace'
  | 'routeWorkspace'
  | 'siteWorkspace'
  | 'mapInput'
  | 'fullPage'
  | 'immersiveMapInput';

export type DeclaredAppRouteIntent = Exclude<AppRouteIntent, 'immersiveMapInput'>;

export interface AppRouteIntentMatch {
  staticData?: {
    appRouteIntent?: DeclaredAppRouteIntent;
  };
}

export function resolveAppRouteIntent(
  matches: readonly AppRouteIntentMatch[],
  runtimeIntent?: 'immersiveMapInput',
): AppRouteIntent {
  if (matches.some((match) => match.staticData?.appRouteIntent === 'fullPage')) {
    return 'fullPage';
  }

  if (runtimeIntent) return runtimeIntent;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const declaredIntent = matches[index]?.staticData?.appRouteIntent;
    if (declaredIntent) return declaredIntent;
  }

  return 'browse';
}
