import { readFileSync } from 'node:fs';
import { createTheme, MantineProvider } from '@mantine/core';
import { act, fireEvent, render as testingLibraryRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import CarouselLightbox from './CarouselLightbox';

const framedModalTheme = createTheme({
  components: {
    Modal: {
      styles: {
        content: {
          background: 'var(--wa-surface-dialog)',
          border: '1px solid var(--wa-glass-border)',
          borderRadius: '16px',
          boxShadow: 'var(--wa-glass-shadow-md)',
        },
      },
    },
  },
});

const carouselLightboxCss = readFileSync('apps/web/src/shared/ui/CarouselLightbox/CarouselLightbox.module.css', 'utf8');

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = carouselLightboxCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

describe('CarouselLightbox', () => {
  beforeAll(() => {
    global.IntersectionObserver = class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    } as unknown as typeof IntersectionObserver;
  });

  it('keeps static controls out of the fading media while captions stay with the active item', async () => {
    const user = userEvent.setup();

    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
        renderOverlay={(index) => <span>{index === 0 ? 'First status' : 'Second status'}</span>}
        renderActions={() => <button type="button">Add to cart</button>}
      />,
    );

    const media = screen.getByAltText('Media preview');
    const mediaFrame = media.closest('[data-lightbox-media-frame="frameless"]');
    expect(media!.closest('[data-lightbox-media-surface]')).not.toBeNull();
    expect(media.closest('[data-lightbox-media-transition]')).not.toBeNull();
    expect(mediaFrame).not.toBeNull();
    expect(mediaFrame?.getAttribute('data-lightbox-active-media-id')).toBe('media-1');
    expect(mediaFrame?.getAttribute('data-lightbox-resize-animation')).toBe('none');

    const caption = screen.getByText('First status');
    expect(caption.closest('[data-lightbox-media-caption]')).not.toBeNull();
    expect(caption.closest('[data-lightbox-caption-transition]')).not.toBeNull();
    expect(caption.closest('[data-lightbox-static-chrome="media-frame"]')).toBeNull();

    const indicators = document.querySelector('[data-lightbox-indicators-placement="below-media"]');
    expect(indicators?.closest('[data-lightbox-static-chrome="media-frame"]')).not.toBeNull();
    expect(indicators?.closest('[data-lightbox-media-transition]')).toBeNull();

    const closeButton = screen.getByRole('button', { name: 'Close preview' });
    const staticChrome = closeButton.closest('[data-lightbox-static-chrome="media-frame"]');
    expect(closeButton.getAttribute('data-lightbox-icon-frame')).toBe('chip');
    expect(closeButton.closest('[data-lightbox-control-rail]')).not.toBeNull();
    expect(staticChrome).not.toBeNull();
    expect(closeButton.closest('[data-lightbox-media-transition]')).toBeNull();

    const actionButton = screen.getByRole('button', { name: 'Add to cart' });
    expect(actionButton.closest('[data-lightbox-floating-actions]')).not.toBeNull();
    expect(actionButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
    expect(actionButton.closest('[data-lightbox-media-transition]')).toBeNull();

    const previousButton = screen.getByRole('button', { name: 'Previous media' });
    const nextButton = screen.getByRole('button', { name: 'Next media' });
    expect(previousButton.getAttribute('data-lightbox-icon-frame')).toBe('chip');
    expect(nextButton.getAttribute('data-lightbox-icon-frame')).toBe('chip');
    expect(previousButton.closest('[data-lightbox-control-anchor]')).not.toBeNull();
    expect(nextButton.closest('[data-lightbox-control-anchor]')).not.toBeNull();
    expect(previousButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
    expect(nextButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
    expect(previousButton.closest('[data-lightbox-media-transition]')).toBeNull();
    expect(nextButton.closest('[data-lightbox-media-transition]')).toBeNull();

    await user.click(nextButton);

    expect(
      document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id'),
    ).toBe('media-2');
    expect(screen.getByText('2 / 2')).toBe(document.querySelector('[data-lightbox-position-counter]'));
    expect(screen.getByText('Second status').closest('[data-lightbox-caption-transition]')).not.toBeNull();
    expect(nextButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
  });

  it('crossfades tall and short slides in independent full-frame overlays', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'portrait', url: 'https://cdn.example.com/portrait.jpg', width: 600, height: 1200 },
          { id: 'landscape', url: 'https://cdn.example.com/landscape.jpg', width: 1200, height: 800 },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    const transitioningSlides = Array.from(
      document.querySelectorAll<HTMLElement>('[data-lightbox-media-transition]'),
    );
    expect(transitioningSlides).toHaveLength(2);
    expect(cssRule('.mediaTransition')).toContain('position: absolute');
    expect(cssRule('.mediaTransition')).toContain('inset: 0');
    expect(cssRule('.mediaTransition')).toContain('grid-template: minmax(0, 1fr) / minmax(0, 1fr)');
    expect(transitioningSlides.every((slide) => !slide.style.transform)).toBe(true);
  });

  it('moves focus onto the close control when it opens', async () => {
    render(
      <CarouselLightbox
        items={[{ id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' }]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Close preview' })).toHaveFocus());
  });

  it('navigates by keyboard; a touch drag no longer navigates (reserved for zoom)', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
          { id: 'media-3', url: 'https://cdn.example.com/photo-3.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(
      document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id'),
    ).toBe('media-2');

    const mediaFrame = document.querySelector('[data-lightbox-media-frame="frameless"]');
    expect(mediaFrame).not.toBeNull();
    fireEvent.pointerDown(mediaFrame!, { pointerId: 1, clientX: 200, clientY: 50, pointerType: 'touch' });
    fireEvent.pointerMove(mediaFrame!, { pointerId: 1, clientX: 80, clientY: 54, pointerType: 'touch' });
    fireEvent.pointerUp(mediaFrame!, { pointerId: 1, clientX: 80, clientY: 54, pointerType: 'touch' });

    expect(
      document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id'),
    ).toBe('media-2');
  });

  it('keeps touches on navigation icons out of media gesture tracking', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const mediaFrame = document.querySelector<HTMLElement>('[data-lightbox-media-frame="frameless"]')!;
    const capturePointer = vi.fn();
    Object.defineProperty(mediaFrame, 'setPointerCapture', { configurable: true, value: capturePointer });
    const nextIconPath = screen.getByRole('button', { name: 'Next media' }).querySelector('path')!;

    fireEvent.pointerDown(nextIconPath, {
      pointerId: 1,
      clientX: 320,
      clientY: 200,
      pointerType: 'touch',
    });

    expect(capturePointer).not.toHaveBeenCalled();
  });

  it('zooms in on a confirmed double tap and back out on a second one', async () => {
    render(
      <CarouselLightbox
        items={[{ id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' }]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const zoomLayer = document.querySelector<HTMLElement>('[data-lightbox-zoom-layer]');
    expect(zoomLayer).not.toBeNull();
    const mediaFrame = document.querySelector('[data-lightbox-media-frame="frameless"]')!;
    mediaFrame.getBoundingClientRect = () =>
      ({ width: 400, height: 300, x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 300, toJSON: () => ({}) }) as DOMRect;

    const tap = (clientX: number, clientY: number) => {
      fireEvent.pointerDown(zoomLayer!, { pointerId: 1, clientX, clientY, pointerType: 'touch' });
      fireEvent.pointerUp(zoomLayer!, { pointerId: 1, clientX, clientY, pointerType: 'touch' });
    };
    // The zoom level animates in via a spring rather than jumping straight to its
    // target, so read the settling value rather than asserting an exact number.
    const currentScale = () => {
      const match = zoomLayer!.style.transform.match(/scale\(([^)]+)\)/);
      return match?.[1] ? parseFloat(match[1]) : 1;
    };

    expect(currentScale()).toBe(1);
    tap(200, 150);
    tap(200, 150);
    await waitFor(() => expect(currentScale()).toBeGreaterThan(1.5));

    tap(200, 150);
    tap(200, 150);
    await waitFor(() => expect(currentScale()).toBeLessThan(1.2));
  });

  it('waits for the incoming image to decode before switching slides', async () => {
    // The fit-content media frame collapses if a slide commits before its
    // image has dimensions, which desyncs framer layout measurements from the
    // load reflow and sends the controls flying in from stale positions.
    const decodeResolvers: Array<() => void> = [];
    class DecodingImage {
      src = '';
      naturalWidth = 2048;
      naturalHeight = 1365;
      decode() {
        return new Promise<void>((resolve) => {
          decodeResolvers.push(resolve);
        });
      }
    }
    vi.stubGlobal('Image', DecodingImage);

    try {
      render(
        <CarouselLightbox
          items={[
            { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
            { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
            { id: 'media-3', url: 'https://cdn.example.com/photo-3.jpg' },
          ]}
          initialIndex={0}
          opened
          onClose={vi.fn()}
        />,
      );

      const activeMediaId = () =>
        document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id');

      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(activeMediaId()).toBe('media-1');

      await act(async () => {
        decodeResolvers.splice(0).forEach((resolve) => resolve());
      });
      expect(activeMediaId()).toBe('media-2');
      // The gate probe's dimensions must carry over to the mounted img so its
      // layout box is stable even if the browser refetches the source.
      // The exiting slide is still mounted mid-transition, so select by src.
      const mounted = Array.from(document.querySelectorAll('[data-lightbox-media-transition] img'))
        .find((img) => img.getAttribute('src')?.includes('photo-2'));
      expect(mounted?.getAttribute('width')).toBe('2048');
      expect(mounted?.getAttribute('height')).toBe('1365');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps screen-fixed frame chrome reachable while the first image is sized', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const chrome = () => document.querySelector('[data-lightbox-static-chrome="media-frame"]');
    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close preview' })).toBeInTheDocument();
    expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();

    const image = screen.getByAltText('Media preview');
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 800, configurable: true });
    fireEvent.load(image);

    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBeNull();
    expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
  });

  it('uses the media-bounded loader for newly uploaded media until the image loads', () => {
    render(
      <CarouselLightbox
        items={[
          {
            id: 'new-upload',
            url: 'https://cdn.example.com/new-upload.jpg',
            width: 2400,
            height: 1600,
          },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const loader = document.querySelector('[data-lightbox-media-loader]');
    expect(loader).not.toBeNull();
    expect(loader?.classList.contains('mantine-Loader-root')).toBe(true);
    const mediaFrame = loader?.closest('[data-lightbox-media-frame="frameless"]');
    expect(mediaFrame).not.toBeNull();
    const mediaSizer = mediaFrame?.querySelector('[data-lightbox-geometry-sizer]');
    expect(mediaSizer?.getAttribute('width')).toBe('2400');
    expect(mediaSizer?.getAttribute('height')).toBe('1600');

    fireEvent.load(screen.getByAltText('Media preview'));

    expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
  });

  it('holds the frame at its pre-swap size until the incoming media loads', () => {
    // Media dimensions are not available synchronously at the swap commit even
    // when cached, so the frame must keep its old box while framer measures
    // the control layout, then release once real dimensions arrive.
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const frame = () => document.querySelector<HTMLElement>('[data-lightbox-media-frame="frameless"]');
    frame()!.getBoundingClientRect = () =>
      ({ width: 800, height: 455, x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 455, toJSON: () => ({}) }) as DOMRect;

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(frame()!.style.minWidth).toBe('800px');
    expect(frame()!.style.minHeight).toBe('455px');

    const incoming = Array.from(document.querySelectorAll('[data-lightbox-media-transition] img'))
      .find((img) => img.getAttribute('src')?.includes('photo-2'))!;
    fireEvent.load(incoming);
    expect(frame()!.style.minWidth).toBe('');
    expect(frame()!.style.minHeight).toBe('');
  });

  it('adopts image dimensions once loaded so remounts keep their layout box', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const image = screen.getByAltText('Media preview');
    expect(image.getAttribute('width')).toBeNull();

    Object.defineProperty(image, 'naturalWidth', { value: 2400, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1600, configurable: true });
    fireEvent.load(image);

    expect(image.getAttribute('width')).toBe('2400');
    expect(image.getAttribute('height')).toBe('1600');
  });

  it('adopts video dimensions once metadata loads so the frame keeps its layout box', () => {
    // A mounted video defaults to 300x150 until metadata parses; adopting the
    // real dimensions re-renders so framer re-measures the control layout and
    // revisits mount at the right size from the start.
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/clip-1.mp4', type: 'video' },
          { id: 'media-2', url: 'https://cdn.example.com/photo-1.jpg' },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('width')).toBeNull();

    Object.defineProperty(video!, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video!, 'videoHeight', { value: 1080, configurable: true });
    fireEvent(video!, new Event('loadedmetadata'));

    expect(video!.getAttribute('width')).toBe('1920');
    expect(video!.getAttribute('height')).toBe('1080');
  });

  it('hides unknown-geometry video behind the loader until metadata supplies its dimensions', () => {
    render(
      <CarouselLightbox
        items={[{ id: 'media-1', url: 'https://cdn.example.com/clip-1.mp4', type: 'video' }]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.style.visibility).toBe('hidden');
    expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();

    Object.defineProperty(video!, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video!, 'videoHeight', { value: 1080, configurable: true });
    fireEvent(video!, new Event('loadedmetadata'));

    expect(video!.style.visibility).toBe('');
    expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
  });

  it('keeps Safari video controls hidden until metadata and the poster are ready', async () => {
    let resolvePoster: (() => void) | undefined;
    class DecodingPoster {
      src = '';
      naturalWidth = 640;
      naturalHeight = 360;
      decode() {
        return new Promise<void>((resolve) => {
          resolvePoster = resolve;
        });
      }
    }
    vi.stubGlobal('Image', DecodingPoster);

    try {
      render(
        <CarouselLightbox
          items={[{
            id: 'media-1',
            url: 'https://cdn.example.com/clip-1.mp4',
            posterUrl: 'https://cdn.example.com/clip-1-poster.jpg',
            type: 'video',
            width: 1920,
            height: 1080,
          }]}
          initialIndex={0}
          opened
          onClose={vi.fn()}
        />,
      );

      const video = document.querySelector('video');
      expect(video).not.toBeNull();
      expect(video!.style.visibility).toBe('hidden');
      expect(video!.hasAttribute('controls')).toBe(false);
      expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();

      Object.defineProperty(video!, 'videoWidth', { value: 1920, configurable: true });
      Object.defineProperty(video!, 'videoHeight', { value: 1080, configurable: true });
      fireEvent(video!, new Event('loadedmetadata'));

      expect(video!.style.visibility).toBe('hidden');
      expect(video!.hasAttribute('controls')).toBe(false);
      expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();

      await act(async () => resolvePoster?.());

      expect(video!.style.visibility).toBe('');
      expect(video!.hasAttribute('controls')).toBe(true);
      expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps declared video geometry when the delivered preview has smaller dimensions', () => {
    render(
      <CarouselLightbox
        items={[
          {
            id: 'media-1',
            url: 'https://cdn.example.com/clip-1.mp4',
            type: 'video',
            width: 3840,
            height: 2160,
          },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const video = document.querySelector('video');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('width')).toBe('3840');
    expect(video!.getAttribute('height')).toBe('2160');

    // The public lightbox URL is a capped Cloudinary preview, so its encoded
    // dimensions can be smaller than the original media record.
    Object.defineProperty(video!, 'videoWidth', { value: 1024, configurable: true });
    Object.defineProperty(video!, 'videoHeight', { value: 576, configurable: true });
    fireEvent(video!, new Event('loadedmetadata'));

    expect(video!.getAttribute('width')).toBe('3840');
    expect(video!.getAttribute('height')).toBe('2160');
  });

  it('owns known frame geometry outside the animated media layer', () => {
    render(
      <CarouselLightbox
        items={[
          { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg', width: 1006, height: 644 },
          { id: 'media-2', url: 'https://cdn.example.com/photo-2.jpg', width: 1920, height: 1080 },
        ]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const frame = document.querySelector('[data-lightbox-media-frame="frameless"]');
    const geometrySizer = () => frame?.querySelector('[data-lightbox-geometry-sizer]');

    expect(geometrySizer()?.parentElement).toBe(frame);
    expect(geometrySizer()?.closest('[data-lightbox-media-transition]')).toBeNull();
    expect(geometrySizer()?.getAttribute('width')).toBe('1006');
    expect(geometrySizer()?.getAttribute('height')).toBe('644');
    expect(cssRule('.geometrySizer')).toContain('grid-area: 1 / 1');
    expect(cssRule('.geometrySizer')).toContain('visibility: hidden');
    expect(cssRule('.zoomLayer')).toContain('position: absolute');
    expect(cssRule('.zoomLayer')).toContain('inset: 0');
    expect(carouselLightboxCss).toMatch(
      /@container lightbox \(min-width: 760px\)\s*\{\s*\.mediaFrame,\s*\.media,\s*\.geometrySizer\s*\{[^}]*max-height:/,
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(geometrySizer()?.getAttribute('width')).toBe('1920');
    expect(geometrySizer()?.getAttribute('height')).toBe('1080');
  });

  it('keeps the neutral frame when unknown-geometry media fails', () => {
    render(
      <CarouselLightbox
        items={[{ id: 'media-1', url: 'https://cdn.example.com/missing.jpg' }]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
      />,
    );

    const frame = document.querySelector('[data-lightbox-media-frame="frameless"]');
    fireEvent.error(screen.getByAltText('Media preview'));

    expect(frame?.getAttribute('data-lightbox-loading')).toBe('true');
    expect(screen.getByRole('img', { name: 'Image unavailable' })).toBeInTheDocument();
  });

  it('preloads neighboring video posters without preloading the video body', () => {
    const requestedUrls: string[] = [];
    class PreloadingImage {
      naturalWidth = 0;
      naturalHeight = 0;
      private currentSrc = '';
      set src(value: string) {
        this.currentSrc = value;
        requestedUrls.push(value);
      }
      get src() {
        return this.currentSrc;
      }
      decode() {
        return Promise.resolve();
      }
    }
    vi.stubGlobal('Image', PreloadingImage);

    try {
      render(
        <CarouselLightbox
          items={[
            { id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg', width: 1200, height: 800 },
            {
              id: 'media-2',
              url: 'https://cdn.example.com/clip-1.mp4',
              posterUrl: 'https://cdn.example.com/clip-1-poster.jpg',
              type: 'video',
              width: 1920,
              height: 1080,
            },
          ]}
          initialIndex={0}
          opened
          onClose={vi.fn()}
        />,
      );

      expect(requestedUrls).not.toContain('https://cdn.example.com/clip-1-poster.jpg');
      fireEvent.load(screen.getByAltText('Media preview'));
      expect(requestedUrls).toContain('https://cdn.example.com/clip-1-poster.jpg');
      expect(requestedUrls).not.toContain('https://cdn.example.com/clip-1.mp4');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not preload neighbors on Save-Data even after the active photo loads', () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal('Image', class { set src(url: string) { requestedUrls.push(url); } });
    const previousConnection = Object.getOwnPropertyDescriptor(navigator, 'connection');
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    try {
      render(<CarouselLightbox items={[
        { id: '1', url: 'https://cdn.example.com/one.jpg', width: 1200, height: 800 },
        { id: '2', url: 'https://cdn.example.com/two.jpg', width: 1200, height: 800 },
        { id: '3', url: 'https://cdn.example.com/three.jpg', width: 1200, height: 800 },
      ]} initialIndex={0} opened onClose={vi.fn()} />);
      fireEvent.load(screen.getByAltText('Media preview'));
      expect(requestedUrls).toEqual([]);
    } finally {
      if (previousConnection) Object.defineProperty(navigator, 'connection', previousConnection);
      else Reflect.deleteProperty(navigator, 'connection');
      vi.unstubAllGlobals();
    }
  });

  it('opts the carousel modal content out of the themed dialog frame', () => {
    testingLibraryRender(
      <MantineProvider theme={framedModalTheme}>
        <CarouselLightbox
          items={[{ id: 'media-1', url: 'https://cdn.example.com/photo-1.jpg' }]}
          initialIndex={0}
          opened
          onClose={vi.fn()}
        />
      </MantineProvider>,
    );

    const dialog = screen.getByRole('dialog');

    expect(dialog.style.background).toBe('transparent');
    expect(dialog.style.border).toBe('0px');
    expect(dialog.style.getPropertyValue('border-radius')).toBe('0');
    expect(dialog.style.boxShadow).toBe('none');
    expect(dialog.style.getPropertyValue('--mb-shadow')).toBe('none');
    expect(dialog.style.getPropertyValue('--paper-shadow')).toBe('none');
    expect(dialog.style.getPropertyValue('--paper-radius')).toBe('0');
  });

  it('shrink-wraps lightbox chrome to the rendered media dimensions', () => {
    expect(cssRule('.mediaSurface')).toContain('width: fit-content');
    expect(cssRule('.mediaSurface')).toContain('margin: 0 auto');
    expect(cssRule('.mediaFrame')).toContain('width: fit-content');
    expect(cssRule('.media')).toMatch(/(?:^|; )width: auto;/);
    expect(cssRule('.media')).not.toMatch(/(?:^|; )width: 100%;/);

    // Loading feedback overlays the final media box; entering/leaving the
    // loading state must not add or remove a layout participant.
    expect(cssRule('.loadingSlot')).toContain('position: absolute');
    expect(cssRule('.loadingSlot')).toContain('inset: 0');
    expect(cssRule('.loadingSlot')).toContain('pointer-events: none');

    expect(cssRule('.mediaTransition')).toContain('position: absolute');
    expect(cssRule('.mediaTransition')).toContain('inset: 0');
    expect(cssRule('.staticChrome')).toContain('position: absolute');
    expect(cssRule('.staticChrome')).toContain('inset: 0');
    expect(cssRule('.mediaControls')).toContain('position: absolute');
    expect(cssRule('.mediaControls')).toContain('padding: 0');
    // Arrows are shown at every size now — nothing left navigates by touch, so
    // they're no longer "redundant on touch" the way they were when swipe existed.
    expect(cssRule('.mediaControls')).not.toContain('display: none');
    expect(cssRule('.staticChrome')).toContain('pointer-events: none');
    // Every piece of chrome — arrows, rail, counter, caption — is pinned to the screen's
    // own edges (not the photo's) at every size, so nothing about the photo — its aspect
    // ratio, a load, a re-render — can ever displace it.
    expect(cssRule('.controlAnchor')).toContain('position: fixed');
    expect(cssRule('.controlAnchor')).toContain('top: 50%');
    expect(cssRule('.previousControlAnchor')).toContain('left: calc(var(--wa-safe-area-left) + 0.5rem)');
    expect(cssRule('.nextControlAnchor')).toContain('right: calc(var(--wa-safe-area-right) + 0.5rem)');
    expect(cssRule('.controlRail')).toContain('position: fixed');
    expect(cssRule('.controlRail')).toContain('top: calc(var(--wa-safe-area-top) + 0.5rem)');
    expect(cssRule('.controlRail')).toContain('right: calc(var(--wa-safe-area-right) + 0.5rem)');
    expect(cssRule('.controlRail')).not.toContain('transform:');
    // Cart/favorite live in the bottom-right corner, separate from the close button up
    // top — stacking all three in one corner left no room in short landscape viewports.
    expect(cssRule('.floatingActions')).toContain('position: fixed');
    expect(cssRule('.floatingActions')).toContain('bottom: calc(var(--wa-safe-area-bottom) + 0.5rem)');
    expect(cssRule('.floatingActions')).toContain('right: calc(var(--wa-safe-area-right) + 0.5rem)');
    expect(cssRule('.indicators')).toContain('position: fixed');
    expect(cssRule('.indicators')).toContain('bottom: calc(var(--wa-safe-area-bottom) + 0.75rem)');
    expect(cssRule('.mediaCaption')).toContain('position: fixed');
    expect(cssRule('.mediaCaption')).toContain('top: calc(var(--wa-safe-area-top) + 0.75rem)');
    expect(cssRule('.mediaCaption')).toContain('left: calc(var(--wa-safe-area-left) + 0.75rem)');
    // Nothing about chrome placement is still gated by the lightbox container query —
    // the only thing that block still adjusts is the photo's own max height.
    const wideLightboxCss = carouselLightboxCss.split('@container lightbox (min-width: 760px)')[1] ?? '';
    expect(wideLightboxCss).not.toContain('.controlAnchor');
    expect(wideLightboxCss).not.toContain('.controlRail');
    expect(wideLightboxCss).not.toContain('.indicators');
    expect(wideLightboxCss).not.toContain('.mediaCaption');
    expect(wideLightboxCss).not.toContain('.mediaControls');
  });

  it('lets a zoomed photo grow past its own footprint and gestures on it stay off the browser', () => {
    // No overflow:hidden here: a zoomed-in photo is meant to use the full screen,
    // not stay cropped to the photo's own unzoomed footprint.
    expect(cssRule('.mediaFrame')).not.toContain('overflow: hidden');
    expect(cssRule('.mediaFrame')).not.toContain('touch-action: none');
    expect(cssRule('.zoomLayer')).toContain('touch-action: none');
    // Explicit and below .staticChrome's z-index of 3, so an actively zooming photo
    // (which gets its own stacking context from the scale/pan transform) can never
    // end up ordered above the fixed controls.
    expect(cssRule('.zoomLayer')).toContain('z-index: 1');
    expect(cssRule('.staticChrome')).toContain('z-index: 3');
  });
});
