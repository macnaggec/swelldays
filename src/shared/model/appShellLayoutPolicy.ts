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
  navigation: 'leftStrip' | 'compactRail' | 'compactBar' | 'topBar' | 'hidden';
  drawer: {
    presentation: 'persistent' | 'sideOverlay' | 'sideWorkspace' | 'bottomSheet' | 'fullScreen' | 'hidden';
    state: 'compact' | 'expanded' | 'collapsed' | 'full' | 'hidden';
    control: 'expandCollapse' | 'routeBack' | 'workflowBack' | 'none';
    modality: 'nonmodal' | 'modal' | 'none';
    contentDensity: 'compact' | 'comfortable' | 'none';
    canWaitForContent: boolean;
    /**
     * True when this drawer's presentation and the map cannot both be fully
     * usable at once, so the UI must let the user switch between them (the
     * landscape-phone/short side sheet). False for every other presentation,
     * including the regular-height side overlay, where the map stays
     * interactive underneath the drawer at all times.
     */
    mapExclusive: boolean;
  };
  map: {
    interaction: 'interactive' | 'background' | 'decorative' | 'hidden';
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
    mapExclusive: false,
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
      if (routeIntent === 'routeWorkspace' || routeIntent === 'siteWorkspace') return 'full';
      return 'expanded';
    }

    if (routeIntent === 'routeWorkspace' || routeIntent === 'siteWorkspace') return 'expanded';
    if (routeIntent === 'mapInput' || isImmersiveMapInput) return 'compact';
    return preferredExpanded ? 'expanded' : 'compact';
  })();
  const drawerPresentation = sizeBand === 'wide'
    ? 'persistent'
    : sizeBand === 'constrained'
      ? 'sideOverlay'
      : routeIntent === 'routeWorkspace' || routeIntent === 'siteWorkspace'
        ? 'fullScreen'
        : 'bottomSheet';
  const bottomSheetHeightAdjustedPresentation =
    drawerPresentation === 'bottomSheet' && heightBand === 'short'
      ? 'sideOverlay'
      : drawerPresentation;
  // heightBand only ever reads 'short' for a viewport that is also wider than
  // it is tall (viewportCapabilities.ts), so this is genuinely "landscape
  // phone or landscape-shaped tablet" regardless of which width band it
  // falls in — a siteWorkspace there gets the measured-rail map strip
  // uniformly, not just at the wider (constrained) member of that pair.
  const heightAdjustedPresentation =
    heightBand === 'short' && sizeBand !== 'wide' && routeIntent === 'siteWorkspace'
      ? 'sideWorkspace'
      : bottomSheetHeightAdjustedPresentation;
  const mapExclusive = heightAdjustedPresentation === 'sideOverlay' && heightBand === 'short';
  const drawerControl = routeIntent === 'browse'
    || routeIntent === 'galleryWorkspace'
    ? 'expandCollapse'
    : routeIntent === 'routeWorkspace' || routeIntent === 'siteWorkspace'
      ? 'routeBack'
      : routeIntent === 'mapInput' || isImmersiveMapInput
        ? 'workflowBack'
        : 'none';
  const isModal = routeIntent === 'routeWorkspace' && sizeBand !== 'wide';
  const mapInteraction = routeIntent === 'siteWorkspace'
    ? 'decorative'
    : routeIntent === 'routeWorkspace'
      ? 'background'
      : 'interactive';
  // Floating controls assume the drawer sits persistently beside an always-interactive
  // map — true for wide, and for constrained-regular (T01, 2026-08-14: fixed drawer width
  // across states, coexisting map). Compact's drawer genuinely narrows when collapsed, and
  // the short-height side sheet is a map/results *toggle* rather than a coexisting pair, so
  // both keep their controls inside the drawer instead. Constrained-regular reversed to
  // float on 2026-08-15 after user review; see the T01 roadmap task for the superseded
  // in-drawer-only note.
  const panelControls = routeIntent !== 'browse' && routeIntent !== 'galleryWorkspace'
    ? 'hidden'
    : sizeBand !== 'compact' && !mapExclusive
      ? 'adjacent'
      : 'insideDrawer';

  return {
    // The account/cart controls use the wide left strip, the vertical rail on
    // short non-wide surfaces, and the constrained horizontal bar at regular
    // height. Portrait compact navigation is a main-screen utility: it shows
    // for browse and gallery workspace, while every other intent already has
    // its own route or workflow control back to the main screen.
    navigation: isImmersiveMapInput
      ? 'hidden'
      : sizeBand === 'wide'
        ? 'leftStrip'
        : heightBand === 'short'
          ? 'compactRail'
          : sizeBand === 'constrained'
            ? 'compactBar'
            : routeIntent === 'browse' || routeIntent === 'galleryWorkspace'
              ? 'topBar'
              : 'hidden',
    drawer: {
      presentation: heightAdjustedPresentation,
      state: drawerState,
      control: drawerControl,
      modality: isModal ? 'modal' : 'nonmodal',
      contentDensity: drawerState === 'compact' || drawerState === 'collapsed'
        ? 'compact'
        : 'comfortable',
      canWaitForContent: routeIntent === 'browse' && sizeBand === 'wide',
      mapExclusive,
    },
    map: {
      interaction: mapInteraction,
      navigationControl: isImmersiveMapInput
        || (sizeBand !== 'wide' && mapInteraction === 'background')
        || mapInteraction === 'decorative'
        ? 'hidden'
        : 'visible',
    },
    chrome: {
      panelControls,
    },
  };
}
