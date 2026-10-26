import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AppButton } from 'shared/ui/AppButton';
import { FirstVisitPresentationContext } from '../model/firstVisitPresentation';
import { FirstVisitMapReadinessContext } from '../model/firstVisitMapReadiness';
import { firstVisitEntryReducer } from '../model/firstVisitEntry';
import { resolveFirstVisitIntent, resolveFirstVisitPresentation, type FirstVisitIntent } from '../model/firstVisitPolicy';
import { readFirstVisitAcknowledgement, writeFirstVisitAcknowledgement } from '../model/firstVisitStorage';
import { useFirstVisitHandoff } from '../model/useFirstVisitHandoff';
import { FirstVisitDocument } from './FirstVisitDocument';
import classes from './FirstVisitGate.module.css';

interface FirstVisitGateProps {
  children: ReactNode;
  isEligibleRoute: boolean;
  isSessionLoading: boolean;
  isAuthenticated: boolean;
  intent?: FirstVisitIntent;
  presentationKey?: string;
  onOpenPresentation?: () => void;
  onEntered?: () => void;
}

export function FirstVisitGate({ children, isEligibleRoute, isAuthenticated, intent: controlledIntent, presentationKey, onOpenPresentation, onEntered }: FirstVisitGateProps) {
  const initialIntent = useMemo(() => resolveFirstVisitIntent(window.location.hash, window.location.search), []);
  const intent = controlledIntent ?? initialIntent;
  const navigationKey = presentationKey ?? intent;
  const [renderedNavigationKey, setRenderedNavigationKey] = useState(navigationKey);
  const wasCoveringApp = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openPresentation = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    onOpenPresentation?.();
  }, [onOpenPresentation]);
  const presentationNavigation = useMemo(() => onOpenPresentation ? { open: openPresentation } : null, [onOpenPresentation, openPresentation]);
  const [hasVisited, setHasVisited] = useState(readFirstVisitAcknowledgement);
  const [entry, dispatch] = useReducer(firstVisitEntryReducer, { phase: 'reading', mapStatus: 'loading' });
  const [mapAttempt, setMapAttempt] = useState(0);
  const appRef = useRef<HTMLDivElement | null>(null);
  const focusRequest = useRef<'app' | 'intro' | null>(null);
  const overlayRef = useRef<HTMLElement | null>(null);
  const presentation = resolveFirstVisitPresentation({
    isEligibleRoute, isAuthenticated, hasVisited, intent,
    // Public reading never waits for the authentication endpoint.
    isSessionLoading: false,
  });
  if (navigationKey !== renderedNavigationKey) {
    setRenderedNavigationKey(navigationKey);
    dispatch({ type: presentation === 'intro' ? 'show' : 'hide' });
  }
  const isCoveringApp = presentation === 'intro' && entry.phase !== 'map';
  const handleCommit = useCallback(() => dispatch({ type: 'enter' }), []);
  const { reveal, rest } = useFirstVisitHandoff({ surfaceRef: overlayRef });
  const acknowledgeVisit = useCallback(() => {
    writeFirstVisitAcknowledgement();
    setHasVisited(true);
    dispatch({ type: 'revealed' });
    onEntered?.();
  }, [onEntered]);

  useEffect(() => {
    if (!isCoveringApp || entry.phase !== 'revealing') return;
    reveal(acknowledgeVisit);
    return rest;
  }, [acknowledgeVisit, entry.phase, isCoveringApp, rest, reveal]);

  const markMapReady = useCallback(() => dispatch({ type: 'ready' }), []);
  const markMapLoading = useCallback(() => dispatch({ type: 'retry' }), []);
  const markMapFailed = useCallback(() => dispatch({ type: 'failed' }), []);
  const readiness = useMemo(() => ({ isMapReady: entry.mapStatus === 'ready', markMapReady, markMapFailed, markMapLoading, mapAttempt }), [entry.mapStatus, mapAttempt, markMapFailed, markMapLoading, markMapReady]);
  useEffect(() => {
    if (!isCoveringApp || entry.phase !== 'waiting') return;
    const timer = window.setTimeout(markMapFailed, 20_000);
    return () => window.clearTimeout(timer);
  }, [entry.phase, isCoveringApp, markMapFailed]);
  useLayoutEffect(() => {
    if (isCoveringApp && !wasCoveringApp.current && intent === 'intro') {
      if (!returnFocus.current?.isConnected) returnFocus.current = document.activeElement instanceof HTMLElement && appRef.current?.contains(document.activeElement) ? document.activeElement : null;
      overlayRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    }
    if (focusRequest.current === 'app' && !isCoveringApp && entry.phase === 'map') {
      const targets = appRef.current?.querySelectorAll<HTMLElement>('input:not([disabled]):not([type="hidden"]), button:not([disabled]), [tabindex="0"], a[href]');
      const target = targets && [...targets].find((element) => !element.closest('[inert], [hidden], [aria-hidden="true"]'));
      target?.focus({ preventScroll: true });
      focusRequest.current = null;
    } else if (focusRequest.current === 'intro' && isCoveringApp && entry.phase === 'reading') {
      overlayRef.current?.querySelector<HTMLElement>('a[href="/#map"]')?.focus({ preventScroll: true });
      focusRequest.current = null;
    } else if (!isCoveringApp && wasCoveringApp.current) {
      const target = returnFocus.current?.isConnected && !returnFocus.current.closest('[role="menu"]') ? returnFocus.current : appRef.current?.querySelector<HTMLElement>('button[aria-label="Open menu"]');
      target?.focus({ preventScroll: true });
    }
    wasCoveringApp.current = isCoveringApp;
  }, [entry.phase, intent, isCoveringApp]);
  const handleEnter = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    focusRequest.current = event.detail === 0 ? 'app' : null;
    handleCommit();
  }, [handleCommit]);
  const keepReading = useCallback(() => {
    focusRequest.current = 'intro';
    dispatch({ type: 'cancel' });
    rest();
  }, [rest]);

  const retryMap = useCallback(() => {
    dispatch({ type: 'retry' });
    dispatch({ type: 'enter' });
    setMapAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <FirstVisitPresentationContext.Provider value={presentationNavigation}>
    <FirstVisitMapReadinessContext.Provider value={readiness}>
      <div ref={appRef} className={classes.app} data-first-visit-app inert={isCoveringApp ? true : undefined} aria-hidden={isCoveringApp || undefined}>
        {children}
      </div>
      {isCoveringApp && (
        <section ref={overlayRef} className={classes.overlay} data-first-visit-state="intro" aria-label="About Swelldays" onKeyDown={(event) => {
          if (event.key === 'Escape' && (entry.phase === 'waiting' || entry.phase === 'revealing')) { event.preventDefault(); keepReading(); }
        }}>
          <FirstVisitDocument onEnter={handleEnter} />
          {entry.mapStatus === 'error' && <div className={classes.status}>
            <p role="alert">Unable to load the map. You can retry or keep reading.</p>
            <AppButton onClick={retryMap}>Retry map</AppButton>
          </div>}
          {entry.phase === 'waiting' && <div className={classes.status}>
            <p role="status">Preparing the map</p>
            <AppButton onClick={keepReading}>Keep reading</AppButton>
          </div>}
        </section>
      )}
    </FirstVisitMapReadinessContext.Provider>
    </FirstVisitPresentationContext.Provider>
  );
}
