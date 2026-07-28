import type { AppRouteIntent } from './appRouteIntent';
import type { ViewportCapabilities } from './viewportCapabilities';

export interface AppShellLayoutPreferences {
  browseExpanded: boolean;
  galleryExpanded: boolean;
}

export interface AppShellLayoutPolicyInput {
  routeIntent: AppRouteIntent;
  sizeBand: ViewportCapabilities['sizeBand'];
  heightBand: ViewportCapabilities['heightBand'];
  preferences: AppShellLayoutPreferences;
}

export interface AppShellLayoutPolicy {
  navigation: 'leftStrip' | 'compactBar' | 'topBar' | 'hidden';
  drawer: {
    presentation: 'persistent' | 'sideOverlay' | 'bottomSheet' | 'fullScreen' | 'hidden';
    state: 'compact' | 'expanded' | 'collapsed' | 'full' | 'hidden';
    control: 'expandCollapse' | 'routeBack' | 'workflowBack' | 'none';
    modality: 'nonmodal' | 'modal' | 'none';
    contentDensity: 'compact' | 'comfortable' | 'none';
    canWaitForContent: boolean;
  };
  map: {
    interaction: 'interactive' | 'background' | 'hidden';
    navigationControl: 'visible' | 'hidden';
  };
  chrome: {
    panelControls: 'adjacent' | 'insideDrawer' | 'hidden';
  };
}

const hiddenLayoutPolicy: AppShellLayoutPolicy = {
  navigation: 'hidden',
  drawer: {
    presentation: 'hidden',
    state: 'hidden',
    control: 'none',
    modality: 'none',
    contentDensity: 'none',
    canWaitForContent: false,
  },
  map: {
    interaction: 'hidden',
    navigationControl: 'hidden',
  },
  chrome: {
    panelControls: 'hidden',
  },
};

export function deriveAppShellLayoutPolicy(
  { routeIntent, sizeBand, heightBand, preferences }: AppShellLayoutPolicyInput,
): AppShellLayoutPolicy {
  if (routeIntent === 'fullPage') return hiddenLayoutPolicy;

  const isImmersiveMapInput = routeIntent === 'immersiveMapInput';
  if (isImmersiveMapInput && sizeBand === 'wide') {
    return {
      ...hiddenLayoutPolicy,
      map: {
        interaction: 'interactive',
        navigationControl: 'hidden',
      },
    };
  }

  const preferredExpanded = routeIntent === 'galleryWorkspace'
    ? preferences.galleryExpanded
    : preferences.browseExpanded;
  const drawerState = (() => {
    if (sizeBand === 'compact') {
      if (routeIntent === 'browse' || routeIntent === 'galleryWorkspace') {
        return preferredExpanded ? 'full' : 'collapsed';
      }
      if (routeIntent === 'routeWorkspace') return 'full';
      return 'expanded';
    }

    if (routeIntent === 'routeWorkspace') return 'expanded';
    if (routeIntent === 'mapInput' || isImmersiveMapInput) return 'compact';
    return preferredExpanded ? 'expanded' : 'compact';
  })();
  const drawerPresentation = sizeBand === 'wide'
    ? 'persistent'
    : sizeBand === 'constrained'
      ? 'sideOverlay'
      : routeIntent === 'routeWorkspace'
        ? 'fullScreen'
        : 'bottomSheet';
  const heightAdjustedPresentation =
    drawerPresentation === 'bottomSheet' && heightBand === 'short'
      ? 'sideOverlay'
      : drawerPresentation;
  const drawerControl = routeIntent === 'browse'
    || routeIntent === 'galleryWorkspace'
    ? 'expandCollapse'
    : routeIntent === 'routeWorkspace'
      ? 'routeBack'
      : routeIntent === 'mapInput' || isImmersiveMapInput
        ? 'workflowBack'
        : 'none';
  const isModal = routeIntent === 'routeWorkspace' && sizeBand !== 'wide';
  const mapInteraction = routeIntent === 'routeWorkspace'
    ? 'background'
    : 'interactive';
  const panelControls = routeIntent === 'browse' || routeIntent === 'galleryWorkspace'
    ? sizeBand === 'wide' ? 'adjacent' : 'insideDrawer'
    : 'hidden';

  return {
    navigation: isImmersiveMapInput
      ? 'hidden'
      : sizeBand === 'wide'
        ? 'leftStrip'
        : heightBand === 'short' || sizeBand === 'constrained'
          ? 'compactBar'
          : 'topBar',
    drawer: {
      presentation: heightAdjustedPresentation,
      state: drawerState,
      control: drawerControl,
      modality: isModal ? 'modal' : 'nonmodal',
      contentDensity: drawerState === 'compact' || drawerState === 'collapsed'
        ? 'compact'
        : 'comfortable',
      canWaitForContent: routeIntent === 'browse' && sizeBand === 'wide',
    },
    map: {
      interaction: mapInteraction,
      navigationControl: isImmersiveMapInput
        || (sizeBand !== 'wide' && mapInteraction === 'background')
        ? 'hidden'
        : 'visible',
    },
    chrome: {
      panelControls,
    },
  };
}
