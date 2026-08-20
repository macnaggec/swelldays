import {
  FC,
  memo,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  WheelEvent as ReactWheelEvent,
} from 'react';
import { ActionIcon, Loader, Modal } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconX, IconPhotoOff } from '@tabler/icons-react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { getViewportInnerSize } from 'shared/model/viewportMetrics';
import classes from './CarouselLightbox.module.css';

const lightboxIconActionData = { 'data-lightbox-icon-action': 'true' };
const lightboxIconFrameData = { 'data-lightbox-icon-frame': 'chip' };
const lightboxIndicatorsData = { 'data-lightbox-indicators-placement': 'below-media' };
const fadeTransition = { duration: 0.16, ease: 'easeOut' } as const;
const reducedMotionTransition = { duration: 0 } as const;
const zoomSpring = { type: 'spring', stiffness: 300, damping: 30 } as const;
const minZoomScale = 1;
const maxZoomScale = 4;
const doubleTapZoomScale = 2.5;
const doubleTapMaxIntervalMs = 300;
const doubleTapMaxDistancePx = 24;
// Trackpad pinch reaches the browser as a wheel event with ctrlKey set (the same
// signal browsers use for Ctrl+scroll-wheel zoom) — there's no multi-touch pointer
// sequence to read the way there is on a touchscreen.
const wheelZoomSensitivity = 0.0025;
const tapMaxMovementPx = 10;
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

const slideVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: fadeTransition },
  exit: { opacity: 0, transition: fadeTransition },
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

function isInteractiveGestureTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest(
    'button, a, input, textarea, select, video, [role="button"], [data-lightbox-ignore-swipe]',
  ));
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// The farthest a zoomed photo can pan before empty space would show past the edge of
// the actual screen — bounded by the screen, not the photo's own (often much smaller)
// unzoomed footprint, so zooming in can use the full screen rather than stay cropped
// to where the photo originally sat.
function maxPanFor(originalDimensionPx: number, scaleValue: number, viewportDimensionPx: number) {
  return Math.max(0, (originalDimensionPx * scaleValue - viewportDimensionPx) / 2);
}

function preloadableUrl(item: CarouselLightboxItem | undefined) {
  if (!item) return undefined;
  return item.type === 'video' ? item.posterUrl : item.url;
}

export interface CarouselLightboxItem {
  id: string;
  url: string;
  type?: 'image' | 'video';
  /** JPEG preview shown before a video has produced its first playable frame. */
  posterUrl?: string;
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
  /** True once the active image has decoded/loaded, or the active video has both mounted
   *  metadata and a settled poster, and the media hasn't failed. Stored dimensions never count. */
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
 * CarouselLightbox — navigable multi-item modal with keyboard and fixed prev/next
 * controls. Touch gestures are reserved for pinch/double-tap zoom, not navigation.
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
  const [nav, setNav] = useState({ index: initialIndex });
  const { prefersReducedMotion } = useViewportCapabilities();
  // Pinch/double-tap zoom applied to the whole media layer. Reset to 1/0/0 on every
  // slide change (see the effects below) so each photo always opens unzoomed.
  const scale = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    startDistancePx: number;
    startScale: number;
    startPanX: number;
    startPanY: number;
    midpoint: { x: number; y: number };
  } | null>(null);
  const panStateRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const navStateRef = useRef({ committedIndex: initialIndex, pendingIndex: null as number | null, token: 0 });
  // Image urls proven loadable by decode() or a mounted load event. Video visual readiness has
  // separate metadata/poster sources below; mediaDimensionsRef remains layout-only.
  const confirmedUrlsRef = useRef<Set<string>>(new Set());
  // Safari can paint native video controls before either its poster or metadata has settled.
  // Track those visual prerequisites separately so controls are never exposed half-initialized.
  const videoMetadataUrlsRef = useRef<Set<string>>(new Set());
  const settledPosterUrlsRef = useRef<Set<string>>(new Set());
  // Known media dimensions by url. A mounted <video preload="metadata"> starts at the
  // browser default 300x150 until its metadata parses; seeding/adopting real dimensions
  // here lets the loading placeholder match the eventual frame instead of a generic box.
  const mediaDimensionsRef = useRef(new Map<string, { width: number; height: number }>());
  const [, setMediaEpoch] = useState(0);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameHold, setFrameHold] = useState<{ width: number; height: number } | null>(null);
  const failedUrlsRef = useRef<Set<string>>(new Set());
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
  const markVideoMetadataReady = useCallback((url: string) => {
    if (videoMetadataUrlsRef.current.has(url)) return;
    videoMetadataUrlsRef.current.add(url);
    setMediaEpoch((epoch) => epoch + 1);
  }, []);
  const markPosterSettled = useCallback((url: string) => {
    if (settledPosterUrlsRef.current.has(url)) return;
    settledPosterUrlsRef.current.add(url);
    setMediaEpoch((epoch) => epoch + 1);
  }, []);
  const adoptMediaDimensions = useCallback((item: CarouselLightboxItem, observedWidth: number, observedHeight: number) => {
    setFrameHold(null);
    const hasDeclaredDimensions = !!item.width && !!item.height;
    const width = hasDeclaredDimensions ? item.width! : observedWidth;
    const height = hasDeclaredDimensions ? item.height! : observedHeight;
    if (width <= 0) return;
    const known = mediaDimensionsRef.current.get(item.url);
    if (known?.width === width && known?.height === height) return;
    mediaDimensionsRef.current.set(item.url, { width, height });
    setMediaEpoch((epoch) => epoch + 1);
  }, []);

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
    setNav({ index });
    scale.set(1);
    panX.set(0);
    panY.set(0);
  }, [initialIndex, items.length, opened, panX, panY, scale]);

  const whenMediaSized = useCallback((item: CarouselLightboxItem, onReady: () => void) => {
    if ((item.width && item.height) || mediaDimensionsRef.current.has(item.url)) {
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
    setTimeout(() => finish(false), 2000);

    if (item.type === 'video') {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        if (probe.videoWidth > 0 && probe.videoHeight > 0) {
          mediaDimensionsRef.current.set(item.url, { width: probe.videoWidth, height: probe.videoHeight });
        }
        // A detached metadata probe can size the frame, but it cannot prove the
        // mounted video's poster and native control layer are ready to paint.
        finish(false);
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
      if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        mediaDimensionsRef.current.set(item.url, { width: probe.naturalWidth, height: probe.naturalHeight });
      }
      finish(true);
    }, () => finish(false));
  }, [markMediaConfirmed]);

  const navigateTo = useCallback((computeTarget: (currentIndex: number) => number) => {
    if (items.length === 0) return;
    const state = navStateRef.current;
    const current = state.pendingIndex ?? normalizeIndex(state.committedIndex, items.length);
    const target = normalizeIndex(computeTarget(current), items.length);
    if (target === current) return;
    const item = items[target];
    if (!item) return;

    state.pendingIndex = target;
    const token = ++state.token;
    whenMediaSized(item, () => {
      if (navStateRef.current.token !== token) return;
      navStateRef.current.pendingIndex = null;
      navStateRef.current.committedIndex = target;
      const frameRect = frameRef.current?.getBoundingClientRect();
      const targetHasDimensions = (item.width && item.height) || mediaDimensionsRef.current.has(item.url);
      setFrameHold(!targetHasDimensions && frameRect && frameRect.width > 0
        ? { width: frameRect.width, height: frameRect.height }
        : null);
      // A stray tap tracked from before this navigation must never pair with a tap on
      // the new slide into a false double-tap-to-zoom.
      pinchStateRef.current = null;
      panStateRef.current = null;
      tapStartRef.current = null;
      lastTapRef.current = null;
      scale.set(1);
      panX.set(0);
      panY.set(0);
      setNav({ index: target });
    });
  }, [items, panX, panY, scale, whenMediaSized]);

  const activeIndex = normalizeIndex(nav.index, items.length);
  const activeItem = items[activeIndex] ?? null;
  const activeMediaDimensions = activeItem
    ? mediaDimensionsRef.current.get(activeItem.url)
      ?? (activeItem.width && activeItem.height ? { width: activeItem.width, height: activeItem.height } : undefined)
    : undefined;
  // Exactly one source owns the frame box: known dimensions render the in-flow
  // geometry sizer; otherwise the frame keeps its neutral loading dimensions.
  const frameGeometryReady = !!activeMediaDimensions;
  // A media file that failed to load (e.g. a broken video, poster OK but source gone) renders a
  // clear placeholder instead of an empty player / broken glyph. markMediaFailed bumps an epoch,
  // so reading the ref here is reactive.
  const mediaFailed = !!activeItem && failedUrlsRef.current.has(activeItem.url);
  const activeMediaReady = !!activeItem && (
    activeItem.type === 'video'
      ? videoMetadataUrlsRef.current.has(activeItem.url)
        && (!activeItem.posterUrl || settledPosterUrlsRef.current.has(activeItem.posterUrl))
      : confirmedUrlsRef.current.has(activeItem.url)
  );
  const mediaContext: LightboxMediaContext = {
    mediaReady: activeMediaReady && !mediaFailed,
    mediaFailed,
  };
  // Stored dimensions make the frame layout-ready, but only a successful decode/load proves
  // there are media bytes to show. Keep the skeleton until that separate confirmation arrives.
  const mediaLoading = !!activeItem && !mediaContext.mediaReady && !mediaFailed;
  const hasMultiple = items.length > 1;
  const overlay = activeItem ? renderOverlay?.(activeIndex, mediaContext) : null;
  const actions = activeItem ? renderActions?.(activeIndex, mediaContext) : null;
  const motionFadeTransition = prefersReducedMotion ? reducedMotionTransition : fadeTransition;
  const goPrevious = useCallback(() => {
    navigateTo((currentIndex) => currentIndex - 1);
  }, [navigateTo]);
  const goNext = useCallback(() => {
    navigateTo((currentIndex) => currentIndex + 1);
  }, [navigateTo]);
  const setZoom = useCallback((nextScale: number, nextPanX: number, nextPanY: number) => {
    if (prefersReducedMotion) {
      scale.set(nextScale);
      panX.set(nextPanX);
      panY.set(nextPanY);
      return;
    }
    animate(scale, nextScale, zoomSpring);
    animate(panX, nextPanX, zoomSpring);
    animate(panY, nextPanY, zoomSpring);
  }, [panX, panY, prefersReducedMotion, scale]);
  const resetZoom = useCallback(() => setZoom(1, 0, 0), [setZoom]);
  // Pinch changes scale; a single finger pans once zoomed in; a confirmed double
  // tap toggles between fit and a fixed zoom level, centered on the tap point.
  // Swipe no longer navigates — touch is reserved entirely for this gesture.
  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' || isInteractiveGestureTarget(event.target)) return;
    // Pointer capture keeps a finger's move/up events targeted here even if it slides
    // outside the frame mid-gesture — not universally supported (missing in jsdom, and
    // inconsistently across real browsers), so this stays best-effort.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointersRef.current.size === 2) {
      const [a, b] = Array.from(activePointersRef.current.values());
      if (!a || !b) return;
      pinchStateRef.current = {
        startDistancePx: distanceBetween(a, b),
        startScale: scale.get(),
        startPanX: panX.get(),
        startPanY: panY.get(),
        midpoint: midpointBetween(a, b),
      };
      panStateRef.current = null;
      tapStartRef.current = null;
    } else if (activePointersRef.current.size === 1) {
      panStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startPanX: panX.get(),
        startPanY: panY.get(),
      };
      tapStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    }
  }, [panX, panY, scale]);
  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) return;
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const frameRect = frameRef.current?.getBoundingClientRect();
    const frameWidth = frameRect?.width ?? 0;
    const frameHeight = frameRect?.height ?? 0;
    const { widthPx: viewportWidth, heightPx: viewportHeight } = getViewportInnerSize();
    const pinch = pinchStateRef.current;

    if (activePointersRef.current.size === 2 && pinch) {
      const [a, b] = Array.from(activePointersRef.current.values());
      if (!a || !b) return;
      const nextMidpoint = midpointBetween(a, b);
      const nextScale = clamp(
        pinch.startScale * (distanceBetween(a, b) / pinch.startDistancePx),
        minZoomScale,
        maxZoomScale,
      );
      scale.set(nextScale);
      panX.set(clamp(
        pinch.startPanX + (nextMidpoint.x - pinch.midpoint.x),
        -maxPanFor(frameWidth, nextScale, viewportWidth),
        maxPanFor(frameWidth, nextScale, viewportWidth),
      ));
      panY.set(clamp(
        pinch.startPanY + (nextMidpoint.y - pinch.midpoint.y),
        -maxPanFor(frameHeight, nextScale, viewportHeight),
        maxPanFor(frameHeight, nextScale, viewportHeight),
      ));
      return;
    }

    const pan = panStateRef.current;
    if (activePointersRef.current.size === 1 && pan && scale.get() > minZoomScale + 0.01) {
      const deltaX = event.clientX - pan.startX;
      const deltaY = event.clientY - pan.startY;
      const currentScale = scale.get();
      panX.set(clamp(
        pan.startPanX + deltaX,
        -maxPanFor(frameWidth, currentScale, viewportWidth),
        maxPanFor(frameWidth, currentScale, viewportWidth),
      ));
      panY.set(clamp(
        pan.startPanY + deltaY,
        -maxPanFor(frameHeight, currentScale, viewportHeight),
        maxPanFor(frameHeight, currentScale, viewportHeight),
      ));
      if (Math.hypot(deltaX, deltaY) > tapMaxMovementPx) tapStartRef.current = null;
    }
  }, [panX, panY, scale]);
  const endGesture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const wasTracked = activePointersRef.current.has(event.pointerId);
    activePointersRef.current.delete(event.pointerId);
    if (!wasTracked) return;

    if (activePointersRef.current.size === 1) {
      // A pinch just ended with one finger still down — re-anchor pan tracking to
      // that finger's current position instead of the (now stale) pinch midpoint.
      const [remaining] = Array.from(activePointersRef.current.values());
      pinchStateRef.current = null;
      if (remaining) {
        panStateRef.current = { startX: remaining.x, startY: remaining.y, startPanX: panX.get(), startPanY: panY.get() };
      }
      tapStartRef.current = null;
      return;
    }
    if (activePointersRef.current.size > 0) return;

    pinchStateRef.current = null;
    panStateRef.current = null;
    if (scale.get() < 1.05 && (scale.get() !== 1 || panX.get() !== 0 || panY.get() !== 0)) resetZoom();

    const tapEnd = { x: event.clientX, y: event.clientY };
    const tapStart = tapStartRef.current;
    tapStartRef.current = null;
    const isTap = !!tapStart
      && distanceBetween(tapEnd, tapStart) <= tapMaxMovementPx
      && Date.now() - tapStart.time <= doubleTapMaxIntervalMs;
    if (!isTap) {
      lastTapRef.current = null;
      return;
    }

    const previousTap = lastTapRef.current;
    const isDoubleTap = !!previousTap
      && Date.now() - previousTap.time <= doubleTapMaxIntervalMs
      && distanceBetween(tapEnd, previousTap) <= doubleTapMaxDistancePx;
    if (!isDoubleTap) {
      lastTapRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
      return;
    }
    lastTapRef.current = null;

    if (scale.get() > minZoomScale + 0.01) {
      resetZoom();
      return;
    }
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) return;
    // Zoom around the tap point: the offset from center grows by the same factor
    // as the scale, so panning by the negative of that growth keeps the tapped
    // point visually still instead of the zoom recentering under the fingers.
    const offsetX = event.clientX - (frameRect.left + frameRect.width / 2);
    const offsetY = event.clientY - (frameRect.top + frameRect.height / 2);
    const { widthPx: viewportWidth, heightPx: viewportHeight } = getViewportInnerSize();
    const maxPanX = maxPanFor(frameRect.width, doubleTapZoomScale, viewportWidth);
    const maxPanY = maxPanFor(frameRect.height, doubleTapZoomScale, viewportHeight);
    setZoom(
      doubleTapZoomScale,
      clamp(-offsetX * (doubleTapZoomScale - 1), -maxPanX, maxPanX),
      clamp(-offsetY * (doubleTapZoomScale - 1), -maxPanY, maxPanY),
    );
  }, [panX, panY, resetZoom, scale, setZoom]);
  // Trackpad pinch (and Ctrl+scroll-wheel) zoom, anchored so the content point under
  // the cursor stays under it as the scale changes — the same "zoom to point" math as
  // the double-tap handler above, generalized to work from any starting pan/scale.
  const handleWheel = useCallback((event: ReactWheelEvent<HTMLElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const frameRect = frameRef.current?.getBoundingClientRect();
    if (!frameRect) return;

    const currentScale = scale.get();
    const nextScale = clamp(currentScale * (1 - event.deltaY * wheelZoomSensitivity), minZoomScale, maxZoomScale);
    const centerX = frameRect.left + frameRect.width / 2;
    const centerY = frameRect.top + frameRect.height / 2;
    const cursorOffsetX = event.clientX - centerX;
    const cursorOffsetY = event.clientY - centerY;
    const contentX = (cursorOffsetX - panX.get()) / currentScale;
    const contentY = (cursorOffsetY - panY.get()) / currentScale;
    const { widthPx: viewportWidth, heightPx: viewportHeight } = getViewportInnerSize();
    const maxPanX = maxPanFor(frameRect.width, nextScale, viewportWidth);
    const maxPanY = maxPanFor(frameRect.height, nextScale, viewportHeight);

    scale.set(nextScale);
    panX.set(clamp(cursorOffsetX - contentX * nextScale, -maxPanX, maxPanX));
    panY.set(clamp(cursorOffsetY - contentY * nextScale, -maxPanY, maxPanY));
  }, [panX, panY, scale]);

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

  // Decode the active video's poster before exposing Safari's native controls, and warm
  // neighbouring image/poster previews so navigation reaches the same ready state sooner.
  const previousPreloadItem = hasMultiple
    ? items[normalizeIndex(activeIndex - 1, items.length)]
    : undefined;
  const nextPreloadItem = hasMultiple
    ? items[normalizeIndex(activeIndex + 1, items.length)]
    : undefined;
  useEffect(() => {
    if (!opened) return;
    const seenUrls = new Set<string>();
    const activeVideo = activeItem?.type === 'video' ? activeItem : undefined;
    [activeVideo, previousPreloadItem, nextPreloadItem].forEach((item) => {
      const url = preloadableUrl(item);
      if (!url) return;
      if (seenUrls.has(url)) return;
      seenUrls.add(url);

      const image = new Image();
      let settled = false;
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        if (item?.type === 'video') {
          // Even a failed poster must settle so a valid video remains playable;
          // successful posters are already decoded into the browser cache here.
          if (item.posterUrl) markPosterSettled(item.posterUrl);
          return;
        }
        if (!loaded || !item) return;
        markMediaConfirmed(item.url);
        if (image.naturalWidth > 0) {
          mediaDimensionsRef.current.set(item.url, { width: image.naturalWidth, height: image.naturalHeight });
        }
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
      if (typeof image.decode === 'function') {
        image.decode().then(() => finish(true), () => finish(false));
      }
    });
  }, [activeItem, markMediaConfirmed, markPosterSettled, nextPreloadItem, opened, previousPreloadItem]);

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
      // Mantine's default "pop" transition leaves a permanent, non-"none" transform
      // (scale(1)) on .content for as long as the modal is open. Any transform on an
      // ancestor turns descendant position:fixed elements into ones that track that
      // ancestor's box instead of the real screen — exactly the control-rail/counter/
      // caption elements below are meant to escape. "fade" only ever touches opacity.
      transitionProps={{ transition: 'fade' }}
    >
      <div className={classes.stage} data-lightbox-stage>
        {activeItem && (
          <div
            className={classes.mediaSurface}
            data-lightbox-media-surface
          >
            {/* mode="popLayout" (not used here) forces an exiting element to position:absolute
                so it stops holding open flow space while it fades — a no-op now that
                .mediaCaption is already off-flow (position:fixed), and actively harmful:
                it would override that fixed positioning for the length of every exit,
                snapping the outgoing caption back to a spot relative to the photo frame. */}
            <AnimatePresence initial={false}>
              {overlay && (
                <motion.div
                  key={`caption-${activeItem.id}`}
                  className={classes.mediaCaption}
                  data-lightbox-caption-transition
                  data-lightbox-media-caption
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
              data-lightbox-loading={frameGeometryReady ? undefined : true}
              data-lightbox-resize-animation="none"
            >
              {activeMediaDimensions && (
                <svg
                  className={classes.geometrySizer}
                  data-lightbox-geometry-sizer
                  width={activeMediaDimensions.width}
                  height={activeMediaDimensions.height}
                  viewBox={`0 0 ${activeMediaDimensions.width} ${activeMediaDimensions.height}`}
                  aria-hidden="true"
                />
              )}
              {mediaLoading && (
                <div className={classes.loadingSlot} data-lightbox-media-loading-slot>
                  <Loader
                    className={classes.loadingSpinner}
                    data-lightbox-media-loader
                    role="status"
                    aria-label="Loading media"
                  />
                </div>
              )}
              <motion.div
                className={classes.zoomLayer}
                style={{ scale, x: panX, y: panY }}
                data-lightbox-zoom-layer
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                onWheel={handleWheel}
              >
                <AnimatePresence initial={false}>
                  <motion.div
                    key={activeItem.id}
                    className={classes.mediaTransition}
                    data-lightbox-media-transition
                    variants={prefersReducedMotion ? reducedSlideVariants : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                  >
                    {mediaFailed
                      ? (
                        <div className={classes.mediaUnavailable} role="img" aria-label={`${activeItem.type === 'video' ? 'Video' : 'Image'} unavailable`}>
                          <IconPhotoOff size={40} stroke={1.5} />
                          <span className={classes.mediaUnavailableLabel}>{activeItem.type === 'video' ? 'Video unavailable' : 'Image unavailable'}</span>
                        </div>
                      )
                      : activeItem.type === 'video'
                      ? (
                        <video
                          src={activeItem.url}
                          poster={activeItem.posterUrl}
                          className={classes.media}
                          controls={mediaContext.mediaReady}
                          playsInline
                          preload="metadata"
                          style={{ visibility: activeMediaDimensions && mediaContext.mediaReady ? undefined : 'hidden' }}
                          width={activeMediaDimensions?.width}
                          height={activeMediaDimensions?.height}
                          onLoadedMetadata={(event) => {
                            markVideoMetadataReady(activeItem.url);
                            adoptMediaDimensions(activeItem, event.currentTarget.videoWidth, event.currentTarget.videoHeight);
                          }}
                          onError={() => markMediaFailed(activeItem.url)}
                        />
                      )
                      : (
                        <img
                          src={activeItem.url}
                          alt={activeItem.alt ?? 'Media preview'}
                          className={classes.media}
                          style={{ visibility: activeMediaDimensions ? undefined : 'hidden' }}
                          width={activeMediaDimensions?.width}
                          height={activeMediaDimensions?.height}
                          onLoad={(event) => {
                            markMediaConfirmed(activeItem.url);
                            adoptMediaDimensions(activeItem, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight);
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
              >
                {hasMultiple && (
                  <div className={classes.mediaControls} data-lightbox-media-controls>
                    <div
                      className={`${classes.controlAnchor} ${classes.previousControlAnchor}`}
                      data-lightbox-control-anchor="previous"
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
                    </div>

                    <div
                      className={`${classes.controlAnchor} ${classes.nextControlAnchor}`}
                      data-lightbox-control-anchor="next"
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
                    </div>
                  </div>
                )}

                <div
                  className={classes.controlRail}
                  data-lightbox-control-rail
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
                </div>

                {actions && (
                  <div className={classes.floatingActions} data-lightbox-floating-actions>
                    {actions}
                  </div>
                )}

                {hasMultiple && (
                  <div
                    className={classes.indicators}
                    {...lightboxIndicatorsData}
                  >
                    <span className={classes.counter} data-lightbox-position-counter>
                      {activeIndex + 1} / {items.length}
                    </span>
                  </div>
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
