export const FIRST_VISIT_STORAGE_KEY = 'swelldays:first-visit:v1';
export const FIRST_VISIT_ACKNOWLEDGEMENT = 'seen';

export type FirstVisitIntent = 'auto' | 'intro' | 'map';

export type FirstVisitPresentation = 'checking-session' | 'intro' | 'hidden';

interface FirstVisitPolicyInput {
  isEligibleRoute: boolean;
  isSessionLoading: boolean;
  isAuthenticated: boolean;
  hasVisited: boolean;
  intent?: FirstVisitIntent;
}

export function resolveFirstVisitPresentation({
  isEligibleRoute,
  isSessionLoading,
  isAuthenticated,
  hasVisited,
  intent = 'auto',
}: FirstVisitPolicyInput): FirstVisitPresentation {
  if (!isEligibleRoute || intent === 'map') return 'hidden';
  if (intent === 'intro') return 'intro';
  if (hasVisited || isAuthenticated) return 'hidden';
  if (isSessionLoading) return 'checking-session';
  return 'intro';
}

export function resolveFirstVisitIntent(hash: string, search: string): FirstVisitIntent {
  if (hash === '#map') return 'map';
  if (hash === '#intro' || new URLSearchParams(search).get('firstVisitReview') === '1') return 'intro';
  return 'auto';
}
