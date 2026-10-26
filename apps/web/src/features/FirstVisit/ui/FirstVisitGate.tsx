import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { AppButton } from 'shared/ui/AppButton';
import { AppVisibilityContext } from 'shared/model/appVisibility';
import { createPortal } from 'react-dom';
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
  const [entry, dispatch] = useReducer(firstVisitEntryReducer, { phase: document.documentElement.hasAttribute('data-first-visit-enter-requested') ? 'waiting' : 'reading', mapStatus: 'loading' });
  const [hasRequestedEntry, setHasRequestedEntry] = useState(() => document.documentElement.hasAttribute('data-first-visit-enter-requested'));
  const entryRequestedAt = useRef(Number(document.documentElement.getAttribute('data-first-visit-enter-requested')) || null);
  const [resumed] = useState(() => Boolean(document.querySelector('[data-first-visit-initial]')));
  const [initialDocument] = useState(() => document.querySelector<HTMLElement>('[data-first-visit-preserved]'));
  useEffect(() => {
    document.documentElement.removeAttribute('data-first-visit-enter-requested');
    document.documentElement.removeAttribute('data-first-visit-enter-keyboard');
  }, []);
  const [mapAttempt, setMapAttempt] = useState(0);
  const appRef = useRef<HTMLDivElement | null>(null);
  const focusRequest = useRef<'app' | 'intro' | null>(document.documentElement.getAttribute('data-first-visit-enter-keyboard') === 'true' ? 'app' : null);
  const overlayRef = useRef<HTMLElement | null>(initialDocument);
  const presentation = resolveFirstVisitPresentation({
    isEligibleRoute, isAuthenticated, hasVisited, intent,
    // Public reading never waits for the authentication endpoint.
    isSessionLoading: false,
  });
  if (navigationKey !== renderedNavigationKey) {
    setRenderedNavigationKey(navigationKey);
    setHasRequestedEntry(false);
    dispatch({ type: presentation === 'intro' ? 'show' : 'hide' });
  }
  const isCoveringApp = presentation === 'intro' && entry.phase !== 'map';
  const isAppVisible = !isCoveringApp || entry.phase === 'revealing';
  useLayoutEffect(() => {
    if (!initialDocument) return;
    if (classes.overlay) initialDocument.classList.add(classes.overlay);
    initialDocument.setAttribute('role', 'region');
    initialDocument.setAttribute('aria-label', 'About Swelldays');
    initialDocument.toggleAttribute('hidden', !isCoveringApp);
  }, [initialDocument, isCoveringApp]);
  const handleCommit = useCallback(() => {
    entryRequestedAt.current = Number(document.documentElement.getAttribute('data-first-visit-enter-requested')) || Date.now();
    setHasRequestedEntry(true);
    dispatch({ type: 'enter' });
  }, []);
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
    const remaining = Math.max(0, 20_000 - (Date.now() - (entryRequestedAt.current ?? Date.now())));
    const timer = window.setTimeout(markMapFailed, remaining);
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
  const handleEnter = useCallback((event: MouseEvent<HTMLAnchorElement> | globalThis.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    focusRequest.current = event.detail === 0 ? 'app' : null;
    handleCommit();
  }, [handleCommit]);
  const keepReading = useCallback(() => {
    setHasRequestedEntry(false);
    focusRequest.current = 'intro';
    dispatch({ type: 'cancel' });
    rest();
  }, [rest]);

  const retryMap = useCallback(() => {
    entryRequestedAt.current = Date.now();
    dispatch({ type: 'retry' });
    dispatch({ type: 'enter' });
    setMapAttempt((attempt) => attempt + 1);
  }, []);

  useLayoutEffect(() => {
    if (!initialDocument) return;
    const onClick = (event: globalThis.MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href="/#map"]')) handleEnter(event);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (entry.phase === 'waiting' || entry.phase === 'revealing')) {
        event.preventDefault();
        keepReading();
      }
    };
    initialDocument.addEventListener('click', onClick);
    initialDocument.addEventListener('keydown', onKeyDown);
    // The bootstrap listener hands ownership to this gate after its first commit.
    document.dispatchEvent(new Event('swelldays:welcome-ready'));
    return () => {
      initialDocument.removeEventListener('click', onClick);
      initialDocument.removeEventListener('keydown', onKeyDown);
    };
  }, [entry.phase, handleEnter, initialDocument, keepReading]);

  const feedback = <>
    {hasRequestedEntry && entry.mapStatus === 'error' && <div className={classes.status}>
      <p role="alert">Unable to load the map. You can retry or keep reading.</p>
      <div className={classes.statusActions}>
        <AppButton onClick={retryMap}>Retry map</AppButton>
        <AppButton onClick={keepReading}>Keep reading</AppButton>
      </div>
    </div>}
    {entry.phase === 'waiting' && <div className={classes.status}>
      <p role="status">Preparing the map</p>
      <AppButton onClick={keepReading}>Keep reading</AppButton>
    </div>}
  </>;

  return (
    <FirstVisitPresentationContext.Provider value={presentationNavigation}>
    <FirstVisitMapReadinessContext.Provider value={readiness}>
    <AppVisibilityContext.Provider value={isAppVisible}>
      <div ref={appRef} className={classes.app} data-first-visit-app data-app-visible={String(isAppVisible)} inert={isCoveringApp ? true : undefined} aria-hidden={isCoveringApp || undefined}>
        {children}
      </div>
      {isCoveringApp && (initialDocument ? createPortal(feedback, initialDocument) : (
        <section ref={overlayRef} className={classes.overlay} data-first-visit-state="intro" aria-label="About Swelldays" onKeyDown={(event) => {
          if (event.key === 'Escape' && (entry.phase === 'waiting' || entry.phase === 'revealing')) { event.preventDefault(); keepReading(); }
        }}>
          <FirstVisitDocument onEnter={handleEnter} resumed={resumed} />
          {feedback}
        </section>
      ))}
    </AppVisibilityContext.Provider>
    </FirstVisitMapReadinessContext.Provider>
    </FirstVisitPresentationContext.Provider>
  );
}
