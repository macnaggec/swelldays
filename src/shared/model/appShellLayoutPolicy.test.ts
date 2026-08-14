import { describe, expect, it } from 'vitest';
import { deriveAppShellLayoutPolicy } from './appShellLayoutPolicy';
import type { AppRouteIntent } from './appRouteIntent';
import { indeterminateViewportCapabilities } from './viewportCapabilities';

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
      heightBand: 'regular',
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
    ['siteWorkspace', 'expanded', 'routeBack', 'decorative'],
  ] as const)('gives %s its required persistent workspace behavior', (
    routeIntent,
    expectedState,
    expectedControl,
    expectedMapInteraction,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'wide',
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    // leftStrip (wide) shows the rail unconditionally, for every intent.
    expect(policy.navigation).toBe('leftStrip');
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
      heightBand: 'regular',
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
    ['siteWorkspace', 'expanded', 'routeBack', 'nonmodal', 'decorative', 'hidden'],
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
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    // compactBar (sizeBand === 'constrained' here) shows the rail
    // unconditionally, for every intent except immersiveMapInput.
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
      heightBand: 'regular',
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
      heightBand: 'regular',
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
    ['galleryWorkspace', 'bottomSheet', 'expandCollapse', 'nonmodal', 'interactive'],
    ['routeWorkspace', 'fullScreen', 'routeBack', 'modal', 'background'],
    ['mapInput', 'bottomSheet', 'workflowBack', 'nonmodal', 'interactive'],
    ['immersiveMapInput', 'bottomSheet', 'workflowBack', 'nonmodal', 'interactive'],
    ['siteWorkspace', 'fullScreen', 'routeBack', 'nonmodal', 'decorative'],
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
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe(routeIntent === 'galleryWorkspace' ? 'topBar' : 'hidden');
    expect(policy.drawer.presentation).toBe(expectedPresentation);
    expect(policy.drawer.control).toBe(expectedControl);
    expect(policy.drawer.modality).toBe(expectedModality);
    expect(policy.map.interaction).toBe(expectedMapInteraction);
  });

  it('gives compact siteWorkspace a full-screen drawer at its full state', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'siteWorkspace',
      sizeBand: 'compact',
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('fullScreen');
    expect(policy.drawer.state).toBe('full');
  });

  it('keeps a full-page route outside the compact map shell', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'fullPage',
      sizeBand: 'compact',
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    expect(policy.navigation).toBe('hidden');
    expect(policy.drawer.presentation).toBe('hidden');
    expect(policy.map.interaction).toBe('hidden');
  });
});

describe('deriveAppShellLayoutPolicy — height band', () => {
  it.each(['compact', 'constrained'] as const)(
    'uses the vertical compact rail for %s/short non-immersive navigation',
    (sizeBand) => {
      const policy = deriveAppShellLayoutPolicy({
        routeIntent: 'browse',
        sizeBand,
        heightBand: 'short',
        preferences: compactPreferences,
      });

      expect(policy.navigation).toBe('compactRail');
    },
  );

  it.each(['compact', 'constrained'] as const)(
    'keeps immersive map input navigation hidden at %s/short height',
    (sizeBand) => {
      const policy = deriveAppShellLayoutPolicy({
        routeIntent: 'immersiveMapInput',
        sizeBand,
        heightBand: 'short',
        preferences: compactPreferences,
      });

      expect(policy.navigation).toBe('hidden');
    },
  );

  it.each([
    [false, 'collapsed'],
    [true, 'full'],
  ] as const)('never gives a short compact browse drawer a bottom sheet (browseExpanded %s)', (
    browseExpanded,
    expectedState,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'compact',
      heightBand: 'short',
      preferences: { ...compactPreferences, browseExpanded },
    });

    expect(policy.drawer.presentation).toBe('sideOverlay');
    expect(policy.drawer.state).toBe(expectedState);
  });

  it.each([
    'mapInput',
    'immersiveMapInput',
  ] as const)('never gives a short compact %s drawer a bottom sheet', (routeIntent) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent,
      sizeBand: 'compact',
      heightBand: 'short',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('sideOverlay');
  });

  it('keeps the bottom sheet at regular height (boundary guard)', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'compact',
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('bottomSheet');
  });

  it('never breaks the constrained side band at short height', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'constrained',
      heightBand: 'short',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('sideOverlay');
  });

  it.each(['constrained', 'compact'] as const)(
    'gives siteWorkspace its own sideWorkspace presentation at %s/short height — landscape phones and landscape tablets alike',
    (sizeBand) => {
      const policy = deriveAppShellLayoutPolicy({
        routeIntent: 'siteWorkspace',
        sizeBand,
        heightBand: 'short',
        preferences: compactPreferences,
      });

      expect(policy.drawer.presentation).toBe('sideWorkspace');
    },
  );

  it('never gives siteWorkspace a sideWorkspace presentation at wide/short height — persistent stays authoritative there', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'siteWorkspace',
      sizeBand: 'wide',
      heightBand: 'short',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('persistent');
  });

  it.each([
    ['wide', 'regular'],
    ['constrained', 'short'],
    ['compact', 'regular'],
  ] as const)('hides the map navigation control for siteWorkspace at every band (%s/%s)', (
    sizeBand,
    heightBand,
  ) => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'siteWorkspace',
      sizeBand,
      heightBand,
      preferences: compactPreferences,
    });

    expect(policy.map.interaction).toBe('decorative');
    expect(policy.map.navigationControl).toBe('hidden');
  });

  it('never downgrades wide at short height', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'wide',
      heightBand: 'short',
      preferences: compactPreferences,
    });

    expect(policy.drawer.presentation).toBe('persistent');
  });
});

describe('deriveAppShellLayoutPolicy — band-crossing continuity', () => {
  const routeIntents = [
    'browse',
    'galleryWorkspace',
    'routeWorkspace',
    'siteWorkspace',
    'mapInput',
    'fullPage',
    'immersiveMapInput',
  ] satisfies AppRouteIntent[];
  const preferenceCombos = [
    { browseExpanded: false, galleryExpanded: false },
    { browseExpanded: true, galleryExpanded: true },
  ];

  it('re-deriving after crossing bands returns a deep-equal policy for every route intent', () => {
    for (const routeIntent of routeIntents) {
      for (const preferences of preferenceCombos) {
        const first = deriveAppShellLayoutPolicy({
          routeIntent, sizeBand: 'wide', heightBand: 'regular', preferences,
        });
        deriveAppShellLayoutPolicy({ routeIntent, sizeBand: 'constrained', heightBand: 'regular', preferences });
        deriveAppShellLayoutPolicy({ routeIntent, sizeBand: 'compact', heightBand: 'regular', preferences });
        const last = deriveAppShellLayoutPolicy({
          routeIntent, sizeBand: 'wide', heightBand: 'regular', preferences,
        });

        expect(first).toEqual(last);
      }
    }
  });

  it('derivation never mutates the preferences input', () => {
    for (const routeIntent of routeIntents) {
      for (const preferences of preferenceCombos) {
        const frozenPreferences = Object.freeze({ ...preferences });
        const originalPreferences = { ...frozenPreferences };

        expect(() => {
          deriveAppShellLayoutPolicy({
            routeIntent, sizeBand: 'wide', heightBand: 'regular', preferences: frozenPreferences,
          });
          deriveAppShellLayoutPolicy({
            routeIntent, sizeBand: 'constrained', heightBand: 'regular', preferences: frozenPreferences,
          });
          deriveAppShellLayoutPolicy({
            routeIntent, sizeBand: 'compact', heightBand: 'regular', preferences: frozenPreferences,
          });
        }).not.toThrow();

        expect(frozenPreferences).toEqual(originalPreferences);
      }
    }
  });
});

describe('deriveAppShellLayoutPolicy — indeterminate fallback is usable', () => {
  it('derives a mountable browse presentation from the indeterminate capability band', () => {
    const policy = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: indeterminateViewportCapabilities.sizeBand,
      heightBand: 'regular',
      preferences: compactPreferences,
    });

    expect(policy.navigation).not.toBe('hidden');
    expect(policy.drawer.presentation).not.toBe('hidden');
    expect(policy.drawer.control).not.toBe('none');
    expect(policy.map.interaction).toBe('interactive');
  });
});
