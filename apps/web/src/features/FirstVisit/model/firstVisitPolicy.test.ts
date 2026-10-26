import { describe, expect, it } from 'vitest';
import { resolveFirstVisitIntent, resolveFirstVisitPresentation } from './firstVisitPolicy';

describe('resolveFirstVisitPresentation', () => {
  it('shows the introduction to a first-time signed-out visitor on the home route', () => {
    expect(resolveFirstVisitPresentation({
      isEligibleRoute: true,
      isSessionLoading: false,
      isAuthenticated: false,
      hasVisited: false,
    })).toBe('intro');
  });

  it('keeps introduction content hidden while the session is resolving', () => {
    expect(resolveFirstVisitPresentation({
      isEligibleRoute: true,
      isSessionLoading: true,
      isAuthenticated: false,
      hasVisited: false,
    })).toBe('checking-session');
  });

  it('sends authenticated visitors straight to the map', () => {
    expect(resolveFirstVisitPresentation({
      isEligibleRoute: true,
      isSessionLoading: false,
      isAuthenticated: true,
      hasVisited: false,
    })).toBe('hidden');
  });

  it('sends returning visitors straight to the map', () => {
    expect(resolveFirstVisitPresentation({
      isEligibleRoute: true,
      isSessionLoading: false,
      isAuthenticated: false,
      hasVisited: true,
    })).toBe('hidden');
  });

  it('does not interrupt a direct link with the introduction', () => {
    expect(resolveFirstVisitPresentation({
      isEligibleRoute: false,
      isSessionLoading: false,
      isAuthenticated: false,
      hasVisited: false,
    })).toBe('hidden');
  });
});

describe('explicit presentation intent', () => {
  it('opens intro even for an authenticated returning visitor', () => {
    expect(resolveFirstVisitPresentation({ isEligibleRoute: true, isSessionLoading: false, isAuthenticated: true, hasVisited: true, intent: 'intro' })).toBe('intro');
  });
  it('lets a first-time visitor skip directly to the map', () => {
    expect(resolveFirstVisitPresentation({ isEligibleRoute: true, isSessionLoading: false, isAuthenticated: false, hasVisited: false, intent: 'map' })).toBe('hidden');
  });
  it('never overrides an ineligible deep link even with explicit intro', () => {
    expect(resolveFirstVisitPresentation({ isEligibleRoute: false, isSessionLoading: false, isAuthenticated: false, hasVisited: false, intent: 'intro' })).toBe('hidden');
  });
});

describe('location intent', () => {
  it.each([
    ['#intro', '', 'intro'], ['#map', '', 'map'],
    ['', '?firstVisitReview=1', 'intro'], ['#map', '?firstVisitReview=1', 'map'],
    ['#unrelated', '', 'auto'], ['', '?firstVisitReview=0', 'auto'],
  ])('resolves %s %s as %s', (hash, search, expected) => {
    expect(resolveFirstVisitIntent(hash, search)).toBe(expected);
  });
});
