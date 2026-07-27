import { readFileSync } from 'node:fs';
import { createTheme, MantineProvider } from '@mantine/core';
import { act, fireEvent, render as testingLibraryRender, screen } from '@testing-library/react';
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

const carouselLightboxCss = readFileSync('src/shared/ui/CarouselLightbox/CarouselLightbox.module.css', 'utf8');

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
    expect(closeButton.closest('[data-lightbox-control-rail]')?.getAttribute('data-lightbox-layout-animation')).toBe(
      'position-only',
    );
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
    expect(previousButton.closest('[data-lightbox-control-anchor]')?.getAttribute('data-lightbox-layout-animation')).toBe(
      'position-only',
    );
    expect(nextButton.closest('[data-lightbox-control-anchor]')?.getAttribute('data-lightbox-layout-animation')).toBe(
      'position-only',
    );
    expect(previousButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
    expect(nextButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
    expect(previousButton.closest('[data-lightbox-media-transition]')).toBeNull();
    expect(nextButton.closest('[data-lightbox-media-transition]')).toBeNull();

    await user.click(nextButton);

    expect(
      document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id'),
    ).toBe('media-2');
    expect(screen.getByRole('button', { name: 'Show media 2' }).getAttribute('data-active')).toBe('true');
    expect(screen.getByText('Second status').closest('[data-lightbox-caption-transition]')).not.toBeNull();
    expect(nextButton.closest('[data-lightbox-static-chrome="media-frame"]')).toBe(staticChrome);
  });

  it('supports keyboard and touch navigation without a sliding carousel track', () => {
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
    fireEvent.pointerDown(mediaFrame!, { clientX: 200, clientY: 50, pointerType: 'touch' });
    fireEvent.pointerUp(mediaFrame!, { clientX: 120, clientY: 54, pointerType: 'touch' });

    expect(
      document.querySelector('[data-lightbox-media-frame="frameless"]')?.getAttribute('data-lightbox-active-media-id'),
    ).toBe('media-3');
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

  it('keeps the frame chrome hidden until the first image is sized', () => {
    // On first open no gate has stamped dimensions, so the collapsed frame
    // would render every anchored control piled at its center while loading.
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
    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBe('true');
    expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();

    const image = screen.getByAltText('Media preview');
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 800, configurable: true });
    fireEvent.load(image);

    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBeNull();
    expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
  });

  it('uses the shared, media-bounded skeleton for newly uploaded media until the image loads', () => {
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
    expect(loader?.classList.contains('mantine-Skeleton-root')).toBe(true);
    expect(loader?.closest('[data-lightbox-media-frame="frameless"]')).not.toBeNull();
    const mediaSizer = loader?.parentElement?.querySelector('[data-lightbox-media-sizer]');
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
    expect(cssRule('.stage')).toContain('--lightbox-media-control-gap: 0.75rem');
    expect(cssRule('.mediaFrame')).toContain('width: fit-content');
    expect(cssRule('.media')).toMatch(/(?:^|; )width: auto;/);
    expect(cssRule('.media')).not.toMatch(/(?:^|; )width: 100%;/);

    expect(cssRule('.mediaTransition')).toContain('grid-area: 1 / 1');
    expect(cssRule('.staticChrome')).toContain('position: absolute');
    expect(cssRule('.staticChrome')).toContain('inset: 0');
    expect(cssRule('.mediaControls')).toContain('position: absolute');
    expect(cssRule('.mediaControls')).toContain('padding: 0');
    expect(cssRule('.controlAnchor')).toContain('position: absolute');
    expect(cssRule('.controlAnchor')).toContain('top: 50%');
    expect(cssRule('.previousControlAnchor')).toContain(
      'right: calc(100% + var(--lightbox-media-control-gap))',
    );
    expect(cssRule('.nextControlAnchor')).toContain(
      'left: calc(100% + var(--lightbox-media-control-gap))',
    );
    expect(cssRule('.staticChrome')).toContain('pointer-events: none');
    expect(cssRule('.controlRail')).toContain('position: absolute');
    expect(cssRule('.controlRail')).toContain('top: 0.5rem');
    expect(cssRule('.controlRail')).toContain('right: 0.5rem');
    expect(cssRule('.controlRail')).not.toContain('transform:');
    // Above the compact band the rail hangs beside the media, inside the
    // lightbox container query rather than a viewport breakpoint.
    const wideLightboxCss = carouselLightboxCss.split('@container lightbox (min-width: 760px)')[1] ?? '';
    expect(wideLightboxCss).toContain(
      'left: calc(100% + var(--lightbox-media-control-gap))',
    );
    expect(cssRule('.indicators')).toContain('position: absolute');
    expect(cssRule('.indicators')).toContain('top: calc(100% + 0.75rem)');
  });
});
