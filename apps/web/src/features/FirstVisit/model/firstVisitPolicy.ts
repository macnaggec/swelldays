export type FirstVisitPresentation = 'checking-session' | 'intro' | 'hidden';

interface FirstVisitPolicyInput {
  isEligibleRoute: boolean;
  isSessionLoading: boolean;
  isAuthenticated: boolean;
  hasVisited: boolean;
}

export function resolveFirstVisitPresentation({
  isEligibleRoute,
  isSessionLoading,
  isAuthenticated,
  hasVisited,
}: FirstVisitPolicyInput): FirstVisitPresentation {
  if (!isEligibleRoute || hasVisited || isAuthenticated) return 'hidden';
  if (isSessionLoading) return 'checking-session';
  return 'intro';
}
