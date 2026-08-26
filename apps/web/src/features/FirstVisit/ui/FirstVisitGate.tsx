import { ActionIcon } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FirstVisitMapReadinessContext } from '../model/firstVisitMapReadiness';
import { resolveFirstVisitPresentation } from '../model/firstVisitPolicy';
import {
  readFirstVisitAcknowledgement,
  writeFirstVisitAcknowledgement,
} from '../model/firstVisitStorage';
import { useFirstVisitHandoff } from '../model/useFirstVisitHandoff';
import classes from './FirstVisitGate.module.css';

interface FirstVisitGateProps {
  children: ReactNode;
  isEligibleRoute: boolean;
  isSessionLoading: boolean;
  isAuthenticated: boolean;
}

export function FirstVisitGate({
  children,
  isEligibleRoute,
  isSessionLoading,
  isAuthenticated,
}: FirstVisitGateProps) {
  const overlayRef = useRef<HTMLElement | null>(null);
  const [hasVisited, setHasVisited] = useState(readFirstVisitAcknowledgement);
  const [isMapReady, setIsMapReady] = useState(false);
  const [entryRequested, setEntryRequested] = useState(false);
  const isReviewMode = useMemo(
    () => new URLSearchParams(window.location.search).get('firstVisitReview') === '1',
    [],
  );

  const presentation = resolveFirstVisitPresentation({
    isEligibleRoute,
    isSessionLoading: isReviewMode ? false : isSessionLoading,
    isAuthenticated: isReviewMode ? false : isAuthenticated,
    hasVisited: isReviewMode ? false : hasVisited,
  });
  const isCoveringApp = presentation !== 'hidden';

  const acknowledgeVisit = useCallback(() => {
    writeFirstVisitAcknowledgement();
    setHasVisited(true);
  }, []);

  const handleCommit = useCallback(() => setEntryRequested(true), []);

  const {
    onWheel,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reveal,
    rest,
  } = useFirstVisitHandoff({
    surfaceRef: overlayRef,
    isActive: presentation === 'intro',
    onCommit: handleCommit,
  });

  useEffect(() => {
    if (isSessionLoading || !isAuthenticated || hasVisited) return;
    writeFirstVisitAcknowledgement();
    // Authenticated people already know the product. Remembering the bypass
    // prevents the introduction appearing if they later sign out here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session resolution owns this persistent gate transition
    setHasVisited(true);
  }, [hasVisited, isAuthenticated, isSessionLoading]);

  useEffect(() => {
    if (!entryRequested) return;

    // The introduction exists so nobody meets a half-drawn map. Until Mapbox
    // reports its first paint the cover stays put, whatever the visitor did.
    if (!isMapReady) {
      rest();
      return;
    }

    reveal(acknowledgeVisit);
  }, [acknowledgeVisit, entryRequested, isMapReady, rest, reveal]);

  const markMapReady = useCallback(() => setIsMapReady(true), []);

  const readiness = useMemo(
    () => ({ isMapReady, markMapReady }),
    [isMapReady, markMapReady],
  );

  const isWaitingForMap = entryRequested && !isMapReady;

  return (
    <FirstVisitMapReadinessContext.Provider value={readiness}>
      <div
        className={classes.app}
        data-first-visit-app
        inert={isCoveringApp ? true : undefined}
        aria-hidden={isCoveringApp || undefined}
      >
        {children}
      </div>

      {isCoveringApp && (
        <section
          ref={overlayRef}
          className={classes.overlay}
          data-first-visit-state={presentation}
          role={presentation === 'intro' ? 'dialog' : undefined}
          aria-modal={presentation === 'intro' || undefined}
          aria-labelledby={presentation === 'intro' ? 'first-visit-title' : undefined}
          aria-hidden={presentation === 'checking-session' || undefined}
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className={classes.artwork} aria-hidden="true">
            <div className={classes.plate} />
            <div className={`${classes.plate} ${classes.plateTrailing}`} />
          </div>
          <div className={classes.veil} aria-hidden="true" />

          {presentation === 'intro' && (
            <>
              <div className={classes.logo}>
                <span className={classes.rise}>
                  <img
                    src="/swelldays-logo-white.png"
                    alt="Swelldays"
                    className={classes.logoImage}
                  />
                </span>
              </div>

              <div className={classes.content}>
                <div className={classes.message}>
                  <p className={classes.eyebrow}>
                    <span className={classes.rise}>Buy · Sell · Share</span>
                  </p>
                  <h1 id="first-visit-title" className={classes.title}>
                    <span className={classes.rise}>Surf photos &amp; videos</span>
                  </h1>
                  <p className={classes.tagline}>
                    <span className={classes.rise}>
                      Find your session on the map. Sell your shots. Or just share
                      the day with the lineup.
                    </span>
                  </p>
                </div>
              </div>

              <div className={classes.dock}>
                <ActionIcon
                  type="button"
                  variant="transparent"
                  className={classes.enterButton}
                  onClick={handleCommit}
                  aria-label={isWaitingForMap ? 'Preparing the map' : 'Enter the map'}
                  aria-busy={isWaitingForMap || undefined}
                  disabled={isWaitingForMap}
                >
                  <span className={classes.thread} aria-hidden="true" />
                </ActionIcon>
              </div>
            </>
          )}
        </section>
      )}
    </FirstVisitMapReadinessContext.Provider>
  );
}
