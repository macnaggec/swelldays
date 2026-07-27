import { createTheme, MantineProvider } from '@mantine/core';
import { fireEvent, render as testingLibraryRender, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import BaseLightbox from './BaseLightbox';

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

describe('BaseLightbox', () => {
  beforeAll(() => {
    global.IntersectionObserver = class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    } as unknown as typeof IntersectionObserver;
  });

  it('renders media as its own surface with close and actions floating outside it, without navigation', () => {
    render(
      <BaseLightbox
        item={{ id: 'media-1', url: 'https://cdn.example.com/photo.jpg' }}
        onClose={vi.fn()}
        renderActions={() => <button type="button">Download original file</button>}
      />,
    );

    const media = screen.getByAltText('Media preview');
    const mediaFrame = media.closest('[data-lightbox-media-frame="frameless"]');
    expect(media.closest('[data-lightbox-media-surface]')).not.toBeNull();
    expect(mediaFrame).not.toBeNull();

    const closeButton = screen.getByRole('button', { name: 'Close preview' });
    expect(closeButton.getAttribute('data-lightbox-icon-frame')).toBe('chip');
    expect(closeButton.closest('[data-lightbox-control-rail]')).not.toBeNull();
    expect(closeButton.closest('[data-lightbox-media-frame="frameless"]')).toBe(mediaFrame);

    const downloadButton = screen.getByRole('button', { name: 'Download original file' });
    expect(downloadButton.closest('[data-lightbox-floating-actions]')).not.toBeNull();
    expect(downloadButton.closest('[data-lightbox-media-frame="frameless"]')).toBe(mediaFrame);

    // Single item: the carousel must not render navigation chrome.
    expect(screen.queryByRole('button', { name: 'Previous media' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next media' })).toBeNull();
    expect(document.querySelector('[data-lightbox-indicators-placement]')).toBeNull();
  });

  it('shows a loader and hides the chrome until the image is sized', () => {
    render(
      <BaseLightbox
        item={{ id: 'media-1', url: 'https://cdn.example.com/photo.jpg' }}
        onClose={vi.fn()}
      />,
    );

    const chrome = () => document.querySelector('[data-lightbox-static-chrome="media-frame"]');
    expect(document.querySelector('[data-lightbox-media-loader]')).not.toBeNull();
    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBe('true');

    const image = screen.getByAltText('Media preview');
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 800, configurable: true });
    fireEvent.load(image);

    expect(document.querySelector('[data-lightbox-media-loader]')).toBeNull();
    expect(chrome()?.getAttribute('data-lightbox-chrome-hidden')).toBeNull();
  });

  it('opts the modal content out of the themed dialog frame', () => {
    testingLibraryRender(
      <MantineProvider theme={framedModalTheme}>
        <BaseLightbox
          item={{ id: 'media-1', url: 'https://cdn.example.com/photo.jpg' }}
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
});
