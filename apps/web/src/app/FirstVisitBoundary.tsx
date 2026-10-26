import { useCallback, type ReactNode } from 'react';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { FirstVisitGate, resolveFirstVisitIntent } from 'features/FirstVisit';
import { firstVisitReturnHref } from './lib/firstVisitNavigation';

export function FirstVisitBoundary({ children, isEligibleRoute, isSessionLoading, isAuthenticated }: {
  children: ReactNode;
  isEligibleRoute: boolean;
  isSessionLoading: boolean;
  isAuthenticated: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const returnHref = firstVisitReturnHref(location.state.firstVisitReturnHref);
  const sameDocumentReturn = returnHref?.split('#')[0] === location.href.split('#')[0];
  const intent = resolveFirstVisitIntent(location.hash ? `#${location.hash}` : '', location.searchStr);
  const open = useCallback(() => {
    const href = firstVisitReturnHref(location.href);
    if (!href) return;
    void navigate({
      href: `${href.split('#')[0]}#intro`,
      state: (previous) => ({ ...previous, firstVisitReturnHref: href }),
      hashScrollIntoView: false,
    });
  }, [location.href, navigate]);
  const entered = useCallback(() => {
    if (returnHref && sameDocumentReturn && location.state.__TSR_index > 0) {
      router.history.back();
    } else {
      void navigate({ href: `${location.pathname}${location.searchStr}#map`, replace: true, state: {}, hashScrollIntoView: false });
    }
  }, [location.pathname, location.searchStr, location.state.__TSR_index, navigate, returnHref, router.history, sameDocumentReturn]);

  return <FirstVisitGate
    isEligibleRoute={isEligibleRoute || Boolean(sameDocumentReturn && intent === 'intro')}
    isSessionLoading={isSessionLoading}
    isAuthenticated={isAuthenticated}
    intent={intent}
    presentationKey={`${location.href}:${location.state.__TSR_key ?? ''}`}
    onOpenPresentation={open}
    onEntered={entered}
  >{children}</FirstVisitGate>;
}
