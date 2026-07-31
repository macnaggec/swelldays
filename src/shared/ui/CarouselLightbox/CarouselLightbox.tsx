import {
  FC,
  memo,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ActionIcon, Modal, Skeleton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconX, IconPhotoOff } from '@tabler/icons-react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import classes from './CarouselLightbox.module.css';

const lightboxIconActionData = { 'data-lightbox-icon-action': 'true' };
const lightboxIconFrameData = { 'data-lightbox-icon-frame': 'chip' };
const lightboxIndicatorsData = { 'data-lightbox-indicators-placement': 'below-media' };
const fadeTransition = { duration: 0.16, ease: 'easeOut' } as const;
const layoutTransition = { duration: 0.22, ease: 'easeOut' } as const;
const reducedMotionTransition = { duration: 0 } as const;
const slideSpring = { type: 'spring', stiffness: 340, damping: 34, mass: 0.9 } as const;
const slideExitTransition = { duration: 0.18, ease: 'easeOut' } as const;
const swipeThresholdPx = 48;
const dragFollowMaxPx = 88;
const dragFollowFactor = 0.5;
const maxIndicatorItems = 10;
const framelessModalStyles = {
  content: {
    '--mb-shadow': 'none',
    '--modal-radius': '0',
    '--paper-radius': '0',
    '--paper-shadow': 'none',
    background: 'transparent',
    backgroundColor: 'transparent',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: '0',
    borderRadius: '0',
    boxShadow: 'none',
  },
};

// Slides enter from the direction of travel and exit toward the opposite side,
// so "next" reads as moving forward through the gallery. direction 0 (initial
// open) degrades to a plain fade.
const slideVariants = {
  enter: (direction: number) => ({ x: direction * 56, opacity: 0, scale: 0.985 }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: { x: slideSpring, scale: slideSpring, opacity: fadeTransition },
  },
  exit: (direction: number) => ({
    x: direction * -40,
    opacity: 0,
    transition: { x: slideExitTransition, opacity: fadeTransition },
  }),
};
const reducedSlideVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: reducedMotionTransition },
  exit: { opacity: 0, transition: reducedMotionTransition },
};

function normalizeIndex(index: number, itemCount: number) {
  if (itemCount <= 0) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

function isInteractiveSwipeTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(
    'button, a, input, textarea, select, video, [role="button"], [data-lightbox-ignore-swipe]',
  ));
}

function preloadableUrl(item: CarouselLightboxItem | undefined) {
  return item && item.type !== 'video' ? item.url : undefined;
}

export interface CarouselLightboxItem {
  id: string;
  url: string;
  type?: 'image' | 'video';
  alt?: string;
  /** Original media dimensions in px. When present, the frame opens at the correct size
   *  and the metadata probe is skipped (no reflow, no neutral square placeholder). */
  width?: number | null;
  height?: number | null;
}

/**
 * Reports the active media's load outcome. There's no way to know a media file is good before
 * the browser confirms it, so callers that show purchase-related content (price, cart/favorite)
 * should wait for mediaReady rather than assuming success from mount and retracting it later —
 * that retraction is visible as a flash. Identification content (date, purchased/owner status)
 * doesn't depend on this and can render unconditionally.
 */
export interface LightboxMediaContext {
  /** True once the active media has confirmed loaded (a successful decode() or the mounted
   *  element's load event — stored metadata alone never counts) and hasn't failed. */
  mediaReady: boolean;
  /** True if the active media's src failed to load. */
  mediaFailed: boolean;
}

export interface CarouselLightboxProps {
  items: CarouselLightboxItem[];
  initialIndex: number;
  opened: boolean;
  onClose: () => void;
  /** Receives each slide index; render badges or metadata in a caption above that media item. */
  renderOverlay?: (itemIndex: number, context: LightboxMediaContext) => ReactNode;
  /** Receives the current carousel index; render icon actions in the floating control rail. */
  renderActions?: (currentIndex: number, context: LightboxMediaContext) => ReactNode;
  /**
   * Forwarded to Mantine's Modal `returnFocus`. Defaults to true (Mantine's own
   * document.activeElement-at-open capture). Pass false when the caller re-focuses
   * the originating trigger itself by a stable identity instead — required once
   * that trigger can be unmounted and remounted with a new DOM node while the
   * modal is open (e.g. a virtualized list that re-columns on resize).
   */
  returnFocus?: boolean;
}

/**
 * CarouselLightbox — navigable multi-item modal with keyboard, swipe, and prev/next controls.
 * Callers supply renderActions to add context-specific actions per slide.
 */
const CarouselLightbox: FC<CarouselLightboxProps> = memo(({
  items,
  initialIndex,
  opened,
  onClose,
  renderOverlay,
  renderActions,
  returnFocus = true,
}) => {
  const [nav, setNav] = useState({ index: initialIndex, direction: 0 });
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const prefersReducedMotion = useReducedMotion();
  // Elastic drag offset applied to the whole media layer while a touch swipe is in flight.
  const dragX = useMotionValue(0);
  // Urls proven loadable — a successful decode() or a mounted element's load event. This is
  // the load-confirmation source for mediaReady; mediaDimensionsRef is layout-only and may be
  // seeded from stored metadata before the browser has fetched a single byte.
  const confirmedUrlsRef = useRef<Set<string>>(new Set());
  const navStateRef = useRef({ committedIndex: initialIndex, pendingIndex: null as number | null, token: 0 });
  // Known media dimensions by url. A mounted <video preload="metadata"> starts
  // at the browser default 300x150 until its metadata parses, so without
  // explicit width/height the frame reflows outside a React commit and framer
  // animates the controls from stale positions.
  const mediaDimensionsRef = useRef(new Map<string, { width: number; height: number }>());
  const [, setMediaEpoch] = useState(0);
  // Even a cached image mounts without synchronous dimensions, so the
  // fit-content frame would collapse exactly when framer measures the control
  // layout (the commit's layout pass) and the controls would fly in from stale
  // positions. Holding the frame at its pre-swap size until the incoming
  // media reports real dimensions keeps the measured layout stable; releasing
  // the hold inside a React commit lets framer animate the old→new shift.
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameHold, setFrameHold] = useState<{ width: number; height: number } | null>(null);
  const failedUrlsRef = useRef<Set<string>>(new Set());
  // A failed load still reveals the chrome so the close control stays reachable.
  const markMediaFailed = useCallback((url: string) => {
    setFrameHold(null);
    if (failedUrlsRef.current.has(url)) return;
    // A broken src usually means a DB row pointing at a dead CDN asset — surface it.
    console.warn('[CarouselLightbox] media failed to load:', url);
    failedUrlsRef.current.add(url);
    setMediaEpoch((epoch) => epoch + 1);
  }, []);
  // First confirmation is render-relevant (it flips mediaReady), so it bumps the epoch.
  const markMediaConfirmed = useCallback((url: string) => {
    if (confirmedUrlsRef.current.has(url)) return;
    confirmedUrlsRef.current.add(url);
    setMediaEpoch((epoch) => epoch + 1);
  }, []);
  const adoptMediaDimensions = useCallback((url: string, width: number, height: number) => {
    setFrameHold(null);
    // The load event proves the file is good even when the reported dimensions match the
    // seeded ones and the early return below skips the dimensions epoch bump.
    markMediaConfirmed(url);
    if (width <= 0) return;
    const known = mediaDimensionsRef.current.get(url);
    if (known?.width === width && known?.height === height) return;
    mediaDimensionsRef.current.set(url, { width, height });
    setMediaEpoch((epoch) => epoch + 1);
  }, [markMediaConfirmed]);

  // Seed dimensions known up front (from stored media metadata) so the frame opens at the
  // correct aspect ratio immediately and the preload="metadata" probe is unnecessary.
  useEffect(() => {
    for (const item of items) {
      if (item.width && item.height && !mediaDimensionsRef.current.has(item.url)) {
        mediaDimensionsRef.current.set(item.url, { width: item.width, height: item.height });
      }
    }
  }, [items]);

  // Sync position when the lightbox opens or a different item is targeted.
  useEffect(() => {
    if (!opened) return;
    const index = normalizeIndex(initialIndex, items.length);
    navStateRef.current = { committedIndex: index, pendingIndex: null, token: navStateRef.current.token + 1 };
    setFrameHold(null);
    setNav({ index, direction: 0 });
  }, [initialIndex, items.length, opened]);

  // Framer layout animations re-measure only on React commits, so a slide must
  // not commit before its media has dimensions: the fit-content frame would
  // collapse, then the load reflow would displace the controls by the stale
  // layout delta, sending them flying in from outside the viewport.
  const whenMediaReady = useCallback((item: CarouselLightboxItem, onReady: () => void) => {
    if (confirmedUrlsRef.current.has(item.url)) {
      onReady();
      return;
    }
    let settled = false;
    const finish = (markReady: boolean) => {
      if (settled) return;
      settled = true;
      if (markReady) markMediaConfirmed(item.url);
      onReady();
    };
    // A stalled network must not freeze navigation; committing anyway just
    // degrades to the pre-gate behaviour for that slide.
    setTimeout(() => finish(false), 2000);

    if (item.type === 'video') {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (probe.videoWidth > 0) {
          mediaDimensionsRef.current.set(item.url, { width: probe.videoWidth, height: probe.videoHeight });
        }
        finish(true);
      };
      probe.onerror = () => finish(false);
      probe.src = item.url;
      return;
    }

    const probe = new Image();
    probe.src = item.url;
    if (typeof probe.decode !== 'function') {
      finish(false);
      return;
    }
    probe.decode().then(() => {
      // The mounted <img> may still refetch (e.g. non-cacheable authenticated
      // URLs), so carry the dimensions over to keep its layout box stable.
      if (probe.naturalWidth > 0) {
        mediaDimensionsRef.current.set(item.url, { width: probe.naturalWidth, height: probe.naturalHeight });
      }
      finish(true);
    }, () => finish(false));
  }, [markMediaConfirmed]);

  const navigateTo = useCallback((computeTarget: (currentIndex: number) => number, requestedDirection?: number) => {
    if (items.length === 0) return;
    const state = navStateRef.current;
    const current = state.pendingIndex ?? normalizeIndex(state.committedIndex, items.length);
    const target = normalizeIndex(computeTarget(current), items.length);
    if (target === current) return;
    const direction = requestedDirection ?? (target > current ? 1 : -1);
    const item = items[target];
    if (!item) return;

    state.pendingIndex = target;
    const token = ++state.token;
    whenMediaReady(item, () => {
      if (navStateRef.current.token !== token) return;
      navStateRef.current.pendingIndex = null;
      navStateRef.current.committedIndex = target;
      const frameRect = frameRef.current?.getBoundingClientRect();
      setFrameHold(frameRect && frameRect.width > 0
        ? { width: frameRect.width, height: frameRect.height }
        : null);
      setNav({ index: target, direction });
    });
  }, [items, whenMediaReady]);

  const activeIndex = normalizeIndex(nav.index, items.length);
  const activeItem = items[activeIndex] ?? null;
  const activeMediaDimensions = activeItem ? mediaDimensionsRef.current.get(activeItem.url) : undefined;
  // Until the active media is sized, the fit-content frame is collapsed and
  // every frame-anchored control would render piled up at its center (visible
  // on first open, before any gate has stamped dimensions).
  const chromeReady = !!activeMediaDimensions || (!!activeItem && failedUrlsRef.current.has(activeItem.url));
  const chromeHiddenData = chromeReady ? undefined : true;
  // A media file that failed to load (e.g. a broken video, poster OK but source gone) renders a
  // clear placeholder instead of an empty player / broken glyph. markMediaFailed bumps an epoch,
  // so reading the ref here is reactive.
  const mediaFailed = !!activeItem && failedUrlsRef.current.has(activeItem.url);
  const mediaContext: LightboxMediaContext = {
    mediaReady: !!activeItem && confirmedUrlsRef.current.has(activeItem.url) && !mediaFailed,
    mediaFailed,
  };
  // Stored dimensions make the frame layout-ready, but only a successful decode/load proves
  // there are media bytes to show. Keep the skeleton until that separate confirmation arrives.
  const mediaLoading = !!activeItem && !mediaContext.mediaReady && !mediaFailed;
  const hasMultiple = items.length > 1;
  const overlay = activeItem ? renderOverlay?.(activeIndex, mediaContext) : null;
  const actions = activeItem ? renderActions?.(activeIndex, mediaContext) : null;
  const motionFadeTransition = prefersReducedMotion ? reducedMotionTransition : fadeTransition;
  const motionLayoutTransition = prefersReducedMotion ? reducedMotionTransition : layoutTransition;
  const goToSlide = useCallback((index: number) => {
    navigateTo(() => index);
  }, [navigateTo]);
  const goPrevious = useCallback(() => {
    navigateTo((currentIndex) => currentIndex - 1, -1);
  }, [navigateTo]);
  const goNext = useCallback(() => {
    navigateTo((currentIndex) => currentIndex + 1, 1);
  }, [navigateTo]);
  const settleDrag = useCallback(() => {
    animate(dragX, 0, slideSpring);
  }, [dragX]);
  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!hasMultiple || event.pointerType === 'mouse' || isInteractiveSwipeTarget(event.target)) {
      swipeStartRef.current = null;
      return;
    }

    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  }, [hasMultiple]);
  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const swipeStart = swipeStartRef.current;
    if (!swipeStart || prefersReducedMotion) return;

    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

    dragX.set(Math.max(-dragFollowMaxPx, Math.min(dragFollowMaxPx, deltaX * dragFollowFactor)));
  }, [dragX, prefersReducedMotion]);
  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const swipeStart = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!hasMultiple || !swipeStart) return;

    settleDrag();
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    if (Math.abs(deltaX) < swipeThresholdPx || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    if (deltaX < 0) goNext();
    else goPrevious();
  }, [goNext, goPrevious, hasMultiple, settleDrag]);
  const handlePointerCancel = useCallback(() => {
    swipeStartRef.current = null;
    settleDrag();
  }, [settleDrag]);

  useEffect(() => {
    if (!opened || !hasMultiple) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrevious, hasMultiple, opened]);

  // Warm the browser cache for the neighbouring slides so navigating never
  // fades into a still-loading image.
  const previousPreloadUrl = hasMultiple
    ? preloadableUrl(items[normalizeIndex(activeIndex - 1, items.length)])
    : undefined;
  const nextPreloadUrl = hasMultiple
    ? preloadableUrl(items[normalizeIndex(activeIndex + 1, items.length)])
    : undefined;
  useEffect(() => {
    if (!opened) return;
    [previousPreloadUrl, nextPreloadUrl].forEach((url) => {
      if (!url) return;
      const image = new Image();
      image.src = url;
      if (typeof image.decode === 'function') {
        image.decode().then(() => {
          markMediaConfirmed(url);
          if (image.naturalWidth > 0) {
            mediaDimensionsRef.current.set(url, { width: image.naturalWidth, height: image.naturalHeight });
          }
        }, () => {});
      }
    });
  }, [markMediaConfirmed, nextPreloadUrl, opened, previousPreloadUrl]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      padding={0}
      withCloseButton={false}
      returnFocus={returnFocus}
      zIndex="var(--wa-z-modal-content)"
      classNames={{
        inner: classes.inner,
        content: classes.content,
        body: classes.body,
      }}
      styles={framelessModalStyles}
    >
      <div className={classes.stage} data-lightbox-stage>
        {activeItem && (
          <div
            className={classes.mediaSurface}
            data-lightbox-media-surface
          >
            <AnimatePresence initial={false} mode="popLayout">
              {overlay && (
                <motion.div
                  key={`caption-${activeItem.id}`}
                  className={classes.mediaCaption}
                  data-lightbox-caption-transition
                  data-lightbox-media-caption
                  data-lightbox-chrome-hidden={chromeHiddenData}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={motionFadeTransition}
                >
                  {overlay}
                </motion.div>
              )}
            </AnimatePresence>

            <div
              ref={frameRef}
              className={classes.mediaFrame}
              style={frameHold ? { minWidth: frameHold.width, minHeight: frameHold.height } : undefined}
              data-lightbox-active-media-id={activeItem.id}
              data-lightbox-media-frame="frameless"
              data-lightbox-loading={chromeReady ? undefined : true}
              data-lightbox-resize-animation="none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            >
              {mediaLoading && (
                <div className={classes.loadingSlot} data-lightbox-media-loading-slot>
                  {activeMediaDimensions && (
                    <svg
                      className={classes.loadingSizer}
                      data-lightbox-media-sizer
                      width={activeMediaDimensions.width}
                      height={activeMediaDimensions.height}
                      viewBox={`0 0 ${activeMediaDimensions.width} ${activeMediaDimensions.height}`}
                      aria-hidden="true"
                    />
                  )}
                  <Skeleton
                    className={classes.loadingSkeleton}
                    data-lightbox-media-loader
                    radius="md"
                    role="status"
                    aria-label="Loading media"
                  />
                </div>
              )}
              <motion.div className={classes.dragLayer} style={{ x: dragX }} data-lightbox-drag-layer>
                <AnimatePresence initial={false} mode="popLayout" custom={nav.direction}>
                  <motion.div
                    key={activeItem.id}
                    className={classes.mediaTransition}
                    data-lightbox-media-transition
                    custom={nav.direction}
                    variants={prefersReducedMotion ? reducedSlideVariants : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {mediaFailed
                      ? (
                        <div className={classes.mediaUnavailable} role="img" aria-label={`${activeItem.type === 'video' ? 'Video' : 'Image'} unavailable`}>
                          <IconPhotoOff size={40} stroke={1.5} />
                          <span>{activeItem.type === 'video' ? 'Video unavailable' : 'Image unavailable'}</span>
                        </div>
                      )
                      : activeItem.type === 'video'
                      ? (
                        <video
                          src={activeItem.url}
                          className={classes.media}
                          controls
                          preload="metadata"
                          width={activeMediaDimensions?.width}
                          height={activeMediaDimensions?.height}
                          onLoadedMetadata={(event) => {
                            adoptMediaDimensions(activeItem.url, event.currentTarget.videoWidth, event.currentTarget.videoHeight);
                          }}
                          onError={() => markMediaFailed(activeItem.url)}
                        />
                      )
                      : (
                        <img
                          src={activeItem.url}
                          alt={activeItem.alt ?? 'Media preview'}
                          className={classes.media}
                          width={activeMediaDimensions?.width}
                          height={activeMediaDimensions?.height}
                          onLoad={(event) => {
                            adoptMediaDimensions(activeItem.url, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
                          }}
                          onError={() => markMediaFailed(activeItem.url)}
                        />
                      )
                    }
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              <div
                className={classes.staticChrome}
                data-lightbox-static-chrome="media-frame"
                data-lightbox-chrome-hidden={chromeHiddenData}
              >
                {hasMultiple && (
                  <div className={classes.mediaControls} data-lightbox-media-controls>
                    <motion.div
                      className={`${classes.controlAnchor} ${classes.previousControlAnchor}`}
                      data-lightbox-control-anchor="previous"
                      data-lightbox-layout-animation="position-only"
                      layout="position"
                      transition={motionLayoutTransition}
                    >
                      <ActionIcon
                        aria-label="Previous media"
                        {...lightboxIconActionData}
                        {...lightboxIconFrameData}
                        variant="subtle"
                        size={44}
                        radius="xl"
                        onClick={goPrevious}
                      >
                        <IconChevronLeft size={24} stroke={2} />
                      </ActionIcon>
                    </motion.div>

                    <motion.div
                      className={`${classes.controlAnchor} ${classes.nextControlAnchor}`}
                      data-lightbox-control-anchor="next"
                      data-lightbox-layout-animation="position-only"
                      layout="position"
                      transition={motionLayoutTransition}
                    >
                      <ActionIcon
                        aria-label="Next media"
                        {...lightboxIconActionData}
                        {...lightboxIconFrameData}
                        variant="subtle"
                        size={44}
                        radius="xl"
                        onClick={goNext}
                      >
                        <IconChevronRight size={24} stroke={2} />
                      </ActionIcon>
                    </motion.div>
                  </div>
                )}

                <motion.div
                  className={classes.controlRail}
                  data-lightbox-control-rail
                  data-lightbox-layout-animation="position-only"
                  layout="position"
                  transition={motionLayoutTransition}
                >
                  <ActionIcon
                    aria-label="Close preview"
                    data-lightbox-icon-action="true"
                    data-lightbox-icon-frame="chip"
                    data-autofocus="true"
                    variant="subtle"
                    size={44}
                    radius="xl"
                    onClick={onClose}
                  >
                    <IconX size={24} stroke={2} />
                  </ActionIcon>

                  {actions && (
                    <div className={classes.floatingActions} data-lightbox-floating-actions>
                      {actions}
                    </div>
                  )}
                </motion.div>

                {hasMultiple && (
                  <motion.div
                    className={classes.indicators}
                    {...lightboxIndicatorsData}
                    data-lightbox-layout-animation="position-only"
                    layout="position"
                    transition={motionLayoutTransition}
                  >
                    {items.length <= maxIndicatorItems
                      ? items.map((indicatorItem, indicatorIndex) => (
                        <button
                          key={indicatorItem.id}
                          type="button"
                          className={classes.indicator}
                          data-active={indicatorIndex === activeIndex ? true : undefined}
                          aria-label={`Show media ${indicatorIndex + 1}`}
                          onClick={() => goToSlide(indicatorIndex)}
                        />
                      ))
                      : (
                        <span className={classes.counter} data-lightbox-position-counter>
                          {activeIndex + 1} / {items.length}
                        </span>
                      )}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
});

CarouselLightbox.displayName = 'CarouselLightbox';
export default CarouselLightbox;
