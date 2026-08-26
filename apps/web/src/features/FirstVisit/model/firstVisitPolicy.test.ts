import { describe, expect, it } from 'vitest';
import { resolveFirstVisitPresentation } from './firstVisitPolicy';

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
