import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getViewportCapabilitiesSnapshot,
  indeterminateViewportCapabilities,
  useViewportCapabilities,
} from './viewportCapabilities';

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

describe('viewport capabilities', () => {
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

  it.each([
    [767, 'compact'],
    [768, 'constrained'],
    [1199, 'constrained'],
    [1200, 'wide'],
  ] as const)('classifies a %ipx viewport as %s', (width, expectedBand) => {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });

    expect(getViewportCapabilitiesSnapshot().sizeBand).toBe(expectedBand);
  });

  it('reports height, input, hover, and reduced-motion capabilities semantically', () => {
    Object.defineProperty(window, 'innerHeight', { value: 699, configurable: true });
    mediaQueries.set('(pointer: coarse)', createMediaQuery('(pointer: coarse)', true));
    mediaQueries.set('(hover: hover)', createMediaQuery('(hover: hover)', true));
    mediaQueries.set(
      '(prefers-reduced-motion: reduce)',
      createMediaQuery('(prefers-reduced-motion: reduce)', true),
    );

    const capabilities = getViewportCapabilitiesSnapshot();

    expect(capabilities.heightBand).toBe('short');
    expect(capabilities.primaryPointer).toBe('coarse');
    expect(capabilities.supportsHover).toBe(true);
    expect(capabilities.prefersReducedMotion).toBe(true);
  });

  it('falls back to the compact base band without hover or fine pointer when indeterminate', () => {
    expect(indeterminateViewportCapabilities.sizeBand).toBe('compact');
    expect(indeterminateViewportCapabilities.supportsHover).toBe(false);
    expect(indeterminateViewportCapabilities.primaryPointer).toBe('coarse');
  });

  it('updates subscribers when viewport or media capabilities change', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    const reducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)', false);
    mediaQueries.set('(prefers-reduced-motion: reduce)', reducedMotion);
    const { result } = renderHook(() => useViewportCapabilities());

    expect(result.current.sizeBand).toBe('wide');
    expect(result.current.prefersReducedMotion).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 767, configurable: true });
      window.dispatchEvent(new Event('resize'));
      reducedMotion.setMatches(true);
    });

    expect(result.current.sizeBand).toBe('compact');
    expect(result.current.prefersReducedMotion).toBe(true);
  });
});
