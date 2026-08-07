import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRouteIntent } from './appRouteIntent';
import { deriveAppShellLayoutPolicy } from './appShellLayoutPolicy';
import type { ViewportCapabilities } from './viewportCapabilities';
import {
  AppShellLayoutPolicyProvider,
  isCellActive,
  resolveShellLayoutPolicy,
  useAppShellLayoutPolicy,
  type ActivationCell,
} from './appShellPresentation';

type MutableMediaQuery = MediaQueryList & {
  setMatches: (matches: boolean) => void;
};

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function createMediaQuery(query: string, initialMatches: boolean): MutableMediaQuery {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  return {
    get matches() {
      return matches;
    },
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
      if (typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    dispatchEvent: vi.fn(() => true),
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches, media: query } as MediaQueryListEvent));
    },
  };
}

const sizeBands: readonly ViewportCapabilities['sizeBand'][] = ['compact', 'constrained', 'wide'];
const heightBands: readonly ViewportCapabilities['heightBand'][] = ['short', 'regular'];
const routeIntents: readonly AppRouteIntent[] = [
  'browse',
  'galleryWorkspace',
  'routeWorkspace',
  'siteWorkspace',
  'mapInput',
  'fullPage',
  'immersiveMapInput',
];

const preferences = { browseExpanded: false, galleryExpanded: true };

describe('resolveShellLayoutPolicy', () => {
  for (const sizeBand of sizeBands) {
    for (const heightBand of heightBands) {
      for (const routeIntent of routeIntents) {
        it(`resolves the ${sizeBand}/${heightBand} ${routeIntent} cell against its activation state`, () => {
          const cell = { sizeBand, heightBand, routeIntent };
          const active = isCellActive(cell);

          const resolved = resolveShellLayoutPolicy({ routeIntent, sizeBand, heightBand, preferences });

          const expected = active
            ? deriveAppShellLayoutPolicy({ routeIntent, sizeBand, heightBand, preferences })
            : deriveAppShellLayoutPolicy({
              routeIntent,
              sizeBand: 'wide',
              heightBand: 'regular',
              preferences,
            });

          expect(resolved).toEqual(expected);
        });
      }
    }
  }
});

describe('the mobile browse section shell cells', () => {
  it('resolves to the real compact policy, a bottom sheet over an interactive map', () => {
    const resolved = resolveShellLayoutPolicy({
      routeIntent: 'browse', sizeBand: 'compact', heightBand: 'regular', preferences,
    });

    expect(isCellActive({ sizeBand: 'compact', heightBand: 'regular', routeIntent: 'browse' })).toBe(true);
    expect(resolved).toEqual(deriveAppShellLayoutPolicy({
      routeIntent: 'browse', sizeBand: 'compact', heightBand: 'regular', preferences,
    }));
    expect(resolved.drawer.presentation).toBe('bottomSheet');
  });

  it.each([
    ['compact', 'browse'],
    ['compact', 'galleryWorkspace'],
    ['constrained', 'browse'],
    ['constrained', 'galleryWorkspace'],
  ] as const)('activates the %s/short %s cell as a side overlay over the interactive map', (
    sizeBand,
    routeIntent,
  ) => {
    const cell = { sizeBand, heightBand: 'short', routeIntent } as const;
    const resolved = resolveShellLayoutPolicy({ ...cell, preferences });

    expect(isCellActive(cell)).toBe(true);
    expect(resolved.navigation).toBe('compactBar');
    expect(resolved.drawer.presentation).toBe('sideOverlay');
    expect(resolved.drawer.modality).toBe('nonmodal');
    expect(resolved.map.interaction).toBe('interactive');
  });

  it.each([
    ['compact', 'short', 'mapInput', 'sideOverlay'],
    ['compact', 'regular', 'mapInput', 'bottomSheet'],
    ['constrained', 'short', 'mapInput', 'sideOverlay'],
    ['compact', 'short', 'immersiveMapInput', 'sideOverlay'],
    ['compact', 'regular', 'immersiveMapInput', 'bottomSheet'],
    ['constrained', 'short', 'immersiveMapInput', 'sideOverlay'],
  ] as const)('activates the %s/%s %s cell as a %s drawer over the interactive map', (
    sizeBand,
    heightBand,
    routeIntent,
    expectedPresentation,
  ) => {
    const cell = { sizeBand, heightBand, routeIntent } as const;
    const resolved = resolveShellLayoutPolicy({ ...cell, preferences });

    expect(isCellActive(cell)).toBe(true);
    expect(resolved).toEqual(deriveAppShellLayoutPolicy({ ...cell, preferences }));
    expect(resolved.drawer.presentation).toBe(expectedPresentation);
    expect(resolved.drawer.modality).toBe('nonmodal');
    expect(resolved.map.interaction).toBe('interactive');
  });

  it.each([
    ['compact', 'short', 'sideWorkspace'],
    ['compact', 'regular', 'fullScreen'],
    ['constrained', 'short', 'sideWorkspace'],
  ] as const)('activates the %s/%s siteWorkspace cell as a %s drawer over the decorative map', (
    sizeBand,
    heightBand,
    expectedPresentation,
  ) => {
    const cell = { sizeBand, heightBand, routeIntent: 'siteWorkspace' } as const;
    const resolved = resolveShellLayoutPolicy({ ...cell, preferences });

    expect(isCellActive(cell)).toBe(true);
    expect(resolved).toEqual(deriveAppShellLayoutPolicy({ ...cell, preferences }));
    expect(resolved.drawer.presentation).toBe(expectedPresentation);
    expect(resolved.drawer.control).toBe('routeBack');
    expect(resolved.drawer.modality).toBe('nonmodal');
    expect(resolved.map.interaction).toBe('decorative');
    expect(resolved.map.navigationControl).toBe('hidden');
  });

  it('leaves every other compact and constrained cell falling back to the complete wide lifecycle', () => {
    const stillInactiveCells: readonly ActivationCell[] = [
      { sizeBand: 'constrained', heightBand: 'regular', routeIntent: 'browse' },
      { sizeBand: 'constrained', heightBand: 'regular', routeIntent: 'mapInput' },
      { sizeBand: 'constrained', heightBand: 'regular', routeIntent: 'immersiveMapInput' },
      { sizeBand: 'constrained', heightBand: 'regular', routeIntent: 'siteWorkspace' },
    ];

    for (const cell of stillInactiveCells) {
      expect(isCellActive(cell)).toBe(false);
      expect(resolveShellLayoutPolicy({ ...cell, preferences })).toEqual(deriveAppShellLayoutPolicy({
        ...cell,
        sizeBand: 'wide',
        heightBand: 'regular',
        preferences,
      }));
    }
  });

  it.each([
    'short',
    'regular',
  ] as const)('activates the compact/%s routeWorkspace cell as a full-screen modal over the backgrounded map', (
    heightBand,
  ) => {
    const cell = { sizeBand: 'compact', heightBand, routeIntent: 'routeWorkspace' } as const;
    const resolved = resolveShellLayoutPolicy({ ...cell, preferences });

    expect(isCellActive(cell)).toBe(true);
    expect(resolved.drawer.presentation).toBe('fullScreen');
    expect(resolved.drawer.modality).toBe('modal');
    expect(resolved.map.interaction).toBe('background');
  });

  it('activates the constrained/short routeWorkspace cell as a modal side overlay over the backgrounded map', () => {
    const cell = { sizeBand: 'constrained', heightBand: 'short', routeIntent: 'routeWorkspace' } as const;
    const resolved = resolveShellLayoutPolicy({ ...cell, preferences });

    expect(isCellActive(cell)).toBe(true);
    expect(resolved.drawer.presentation).toBe('sideOverlay');
    expect(resolved.drawer.modality).toBe('modal');
    expect(resolved.map.interaction).toBe('background');
  });
});

describe('AppShellLayoutPolicyProvider', () => {
  const mediaQueries = new Map<string, MutableMediaQuery>();

  beforeEach(() => {
    mediaQueries.clear();
    vi.mocked(window.matchMedia).mockImplementation((query) => {
      const existing = mediaQueries.get(query);
      if (existing) return existing;

      const created = createMediaQuery(query, false);
      mediaQueries.set(query, created);
      return created;
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: originalInnerWidth, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true });
  });

  it('projects a compact, short-height (landscape) browse viewport to the active side-overlay policy', () => {
    // Landscape, not portrait: heightBand only reads 'short' when the viewport is
    // wider than tall — an upright phone with this same small height keeps 'regular'
    // and its bottom sheet (see viewportCapabilities.test.ts).
    Object.defineProperty(window, 'innerWidth', { value: 667, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 375, configurable: true });

    const { result } = renderHook(() => useAppShellLayoutPolicy(), {
      wrapper: ({ children }) => (
        <AppShellLayoutPolicyProvider
          routeIntent="browse"
          browseExpanded={preferences.browseExpanded}
          galleryExpanded={preferences.galleryExpanded}
        >
          {children}
        </AppShellLayoutPolicyProvider>
      ),
    });

    expect(result.current).toEqual(deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'compact',
      heightBand: 'short',
      preferences,
    }));
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useAppShellLayoutPolicy())).toThrow(
      'useAppShellLayoutPolicy must be used within AppShellLayoutPolicyProvider',
    );
  });
});
