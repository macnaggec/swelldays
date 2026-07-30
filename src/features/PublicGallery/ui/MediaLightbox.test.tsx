import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { formatPrice } from 'shared/lib/currency';
import { formatCapturedAtDate } from 'shared/lib/dateUtils';
import MediaLightbox, { type LightboxMedia } from './MediaLightbox';

const mediaItem: LightboxMedia = {
  id: 'media-1',
  lightboxUrl: 'https://cdn.example.com/lightbox.jpg',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  type: 'image',
  price: 300,
  capturedAt: new Date('2026-04-01T10:00:00.000Z'),
  photographerId: 'photographer-1',
};

describe('MediaLightbox', () => {
  beforeAll(() => {
    global.IntersectionObserver = class IntersectionObserverMock {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);
    } as unknown as typeof IntersectionObserver;
  });

  it('puts media metadata in a caption above the image and cart actions in the control rail', () => {
    render(
      <MediaLightbox
        items={[mediaItem]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
        onCartToggle={vi.fn()}
      />,
    );

    // Price and the cart action wait for the media to confirm loaded (mediaReady) — otherwise
    // they'd show optimistically and have to be retracted if the media turned out broken.
    const image = screen.getByAltText(/Surf photo from/);
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    fireEvent.load(image);

    const price = screen.getByText(formatPrice(mediaItem.price ?? 0));
    expect(price.closest('[data-lightbox-media-caption]')).not.toBeNull();

    const addToCart = screen.getByRole('button', { name: 'Add to cart' });
    expect(addToCart).toHaveAttribute('data-lightbox-icon-action', 'true');
    expect(addToCart).toHaveAttribute('data-lightbox-icon-frame', 'chip');
    expect(addToCart).toHaveAttribute('data-lightbox-tooltip-layer', 'above-media');
    expect(addToCart.closest('[data-lightbox-control-rail]')).not.toBeNull();
    expect(addToCart.closest('[data-lightbox-media-caption]')).toBeNull();
  });

  it('shows favorite below cart and toggles the active favorite state', () => {
    const onFavoriteToggle = vi.fn();
    render(
      <MediaLightbox
        items={[mediaItem]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
        onCartToggle={vi.fn()}
        favoriteItemIds={new Set([mediaItem.id])}
        onFavoriteToggle={onFavoriteToggle}
      />,
    );

    const image = screen.getByAltText(/Surf photo from/);
    Object.defineProperty(image, 'naturalWidth', { value: 1200, configurable: true });
    fireEvent.load(image);

    const cart = screen.getByRole('button', { name: 'Add to cart' });
    const favorite = screen.getByRole('button', { name: 'Remove from favorites' });
    expect(cart.compareDocumentPosition(favorite) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(favorite);
    expect(onFavoriteToggle).toHaveBeenCalledWith(mediaItem);
  });

  it('does not trust stored dimensions as load confirmation — price/cart wait for the real load event', () => {
    // Stored width/height seed the frame size on mount; they must not flip mediaReady.
    const sizedItem: LightboxMedia = { ...mediaItem, width: 1600, height: 1067 };
    render(
      <MediaLightbox
        items={[sizedItem]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
        onCartToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText(formatPrice(sizedItem.price ?? 0))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();

    const image = screen.getByAltText(/Surf photo from/);
    // Report the same dimensions as the seed — confirmation must not depend on a dimensions change.
    Object.defineProperty(image, 'naturalWidth', { value: 1600, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 1067, configurable: true });
    fireEvent.load(image);

    expect(screen.getByText(formatPrice(sizedItem.price ?? 0))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('withholds price/cart/favorites until the media loads, and drops them for good on failure — keeping the date either way', () => {
    render(
      <MediaLightbox
        items={[mediaItem]}
        initialIndex={0}
        opened
        onClose={vi.fn()}
        onCartToggle={vi.fn()}
        onFavoriteToggle={vi.fn()}
      />,
    );

    expect(screen.queryByText(formatPrice(mediaItem.price ?? 0))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
    expect(screen.getByText(formatCapturedAtDate(mediaItem.capturedAt))).toBeInTheDocument();

    fireEvent.error(screen.getByAltText(/Surf photo from/));

    expect(screen.queryByText(formatPrice(mediaItem.price ?? 0))).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).toBeNull();
    expect(screen.getByText(formatCapturedAtDate(mediaItem.capturedAt))).toBeInTheDocument();
  });
});
