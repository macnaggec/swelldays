import { describe, expect, it } from 'vitest';
import {
  deriveAppShellLayoutPolicy,
  deriveDesktopFoundationAppShellLayoutPolicy,
} from './appShellLayoutPolicy';
import type { AppRouteIntent } from './appRouteIntent';

const compactPreferences = {
  browseExpanded: false,
  galleryExpanded: false,
};

describe('deriveAppShellLayoutPolicy — wide', () => {
  it.each([
    ['browse', false, 'compact'],
    ['browse', true, 'expanded'],
    ['galleryWorkspace', false, 'compact'],
    ['galleryWorkspace', true, 'expanded'],
  ] as const)('honors the %s expansion preference when expanded is %s', (
    routeIntent,
    preferredExpanded,
    expectedState,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'wide',
      preferences: {
        browseExpanded: routeIntent === 'browse' ? preferredExpanded : false,
        galleryExpanded: routeIntent === 'galleryWorkspace' ? preferredExpanded : false,
      },
    });

    expect(policy.navigation).toBe('leftStrip');
    expect(policy.drawer.presentation).toBe('persistent');
    expect(policy.drawer.state).toBe(expectedState);
    expect(policy.drawer.control).toBe('expandCollapse');
    expect(policy.drawer.modality).toBe('nonmodal');
    expect(policy.drawer.contentDensity).toBe(preferredExpanded ? 'comfortable' : 'compact');
    expect(policy.drawer.canWaitForContent).toBe(routeIntent === 'browse');
    expect(policy.map.interaction).toBe('interactive');
    expect(policy.map.navigationControl).toBe('visible');
    expect(policy.chrome.panelControls).toBe('adjacent');
  });

  it.each([
    ['routeWorkspace', 'expanded', 'routeBack', 'background'],
    ['mapInput', 'compact', 'workflowBack', 'interactive'],
  ] as const)('gives %s its required persistent workspace behavior', (
    routeIntent,
    expectedState,
    expectedControl,
    expectedMapInteraction,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'wide',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('persistent');
    expect(policy.drawer.state).toBe(expectedState);
    expect(policy.drawer.control).toBe(expectedControl);
    expect(policy.drawer.modality).toBe('nonmodal');
    expect(policy.drawer.canWaitForContent).toBe(false);
    expect(policy.map.interaction).toBe(expectedMapInteraction);
    expect(policy.chrome.panelControls).toBe('hidden');
  });

  it.each([
    ['fullPage', 'hidden'],
    ['immersiveMapInput', 'interactive'],
  ] as const)('hides unrelated shell chrome for %s', (routeIntent, expectedMapInteraction) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'wide',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe('hidden');
    expect(policy.drawer.presentation).toBe('hidden');
    expect(policy.drawer.state).toBe('hidden');
    expect(policy.drawer.control).toBe('none');
    expect(policy.map.interaction).toBe(expectedMapInteraction);
    expect(policy.map.navigationControl).toBe('hidden');
  });
});

describe('deriveAppShellLayoutPolicy — constrained', () => {
  it.each([
    ['browse', 'compact', 'expandCollapse', 'nonmodal', 'interactive', 'insideDrawer'],
    ['galleryWorkspace', 'compact', 'expandCollapse', 'nonmodal', 'interactive', 'insideDrawer'],
    ['routeWorkspace', 'expanded', 'routeBack', 'modal', 'background', 'hidden'],
    ['mapInput', 'compact', 'workflowBack', 'nonmodal', 'interactive', 'hidden'],
    ['immersiveMapInput', 'compact', 'workflowBack', 'nonmodal', 'interactive', 'hidden'],
  ] as const)('defines the future %s side-overlay policy without mounting it', (
    routeIntent,
    expectedState,
    expectedControl,
    expectedModality,
    expectedMapInteraction,
    expectedPanelControls,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'constrained',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe(routeIntent === 'immersiveMapInput' ? 'hidden' : 'compactBar');
    expect(policy.drawer.presentation).toBe('sideOverlay');
    expect(policy.drawer.state).toBe(expectedState);
    expect(policy.drawer.control).toBe(expectedControl);
    expect(policy.drawer.modality).toBe(expectedModality);
    expect(policy.drawer.canWaitForContent).toBe(false);
    expect(policy.map.interaction).toBe(expectedMapInteraction);
    expect(policy.chrome.panelControls).toBe(expectedPanelControls);
  });

  it('keeps a full-page route outside the constrained map shell', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'fullPage',
      sizeBand: 'constrained',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe('hidden');
    expect(policy.drawer.presentation).toBe('hidden');
    expect(policy.map.interaction).toBe('hidden');
  });
});

describe('deriveAppShellLayoutPolicy — compact', () => {
  it.each([
    [false, 'collapsed', 'compact'],
    [true, 'full', 'comfortable'],
  ] as const)('maps browse preference %s to a %s bottom sheet', (
    browseExpanded,
    expectedState,
    expectedDensity,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'compact',
      preferences: { ...compactPreferences, browseExpanded },
    });

    expect(policy.navigation).toBe('topBar');
    expect(policy.drawer.presentation).toBe('bottomSheet');
    expect(policy.drawer.state).toBe(expectedState);
    expect(policy.drawer.control).toBe('expandCollapse');
    expect(policy.drawer.contentDensity).toBe(expectedDensity);
    expect(policy.drawer.modality).toBe('nonmodal');
    expect(policy.drawer.canWaitForContent).toBe(false);
    expect(policy.map.interaction).toBe('interactive');
    expect(policy.chrome.panelControls).toBe('insideDrawer');
  });

  it.each([
    ['galleryWorkspace', 'fullScreen', 'none', 'modal', 'background'],
    ['routeWorkspace', 'fullScreen', 'routeBack', 'modal', 'background'],
    ['mapInput', 'bottomSheet', 'workflowBack', 'nonmodal', 'interactive'],
    ['immersiveMapInput', 'bottomSheet', 'workflowBack', 'nonmodal', 'interactive'],
  ] as const)('defines the future %s compact workspace', (
    routeIntent,
    expectedPresentation,
    expectedControl,
    expectedModality,
    expectedMapInteraction,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'compact',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe(routeIntent === 'immersiveMapInput' ? 'hidden' : 'topBar');
    expect(policy.drawer.presentation).toBe(expectedPresentation);
    expect(policy.drawer.control).toBe(expectedControl);
    expect(policy.drawer.modality).toBe(expectedModality);
    expect(policy.map.interaction).toBe(expectedMapInteraction);
  });

  it('keeps a full-page route outside the compact map shell', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'fullPage',
      sizeBand: 'compact',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe('hidden');
    expect(policy.drawer.presentation).toBe('hidden');
    expect(policy.map.interaction).toBe('hidden');
  });
});

describe('deriveDesktopFoundationAppShellLayoutPolicy', () => {
  it.each([
    'browse',
    'galleryWorkspace',
    'routeWorkspace',
    'mapInput',
    'fullPage',
    'immersiveMapInput',
  ] satisfies AppRouteIntent[])('mounts only the approved wide presentation for %s', (routeIntent) => {
    expect(deriveDesktopFoundationAppShellLayoutPolicy({
      routeIntent,
      preferences: compactPreferences,
    })).toEqual(deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'wide',
      preferences: compactPreferences,
    }));
  });
});
