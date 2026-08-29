import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { formatPrice } from 'shared/lib/currency';
import { formatCapturedAtDate } from 'shared/lib/dateUtils';
import PublicCard, { type DisplayMedia } from './PublicCard';

const media: DisplayMedia = {
  id: 'media-1',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  price: 300,
  capturedAt: new Date('2026-04-01T10:00:00Z'),
  type: 'PHOTO',
};

describe('PublicCard favorites action', () => {
  it('labels an active favorite as removable and emits the favorites action', () => {
    const onAction = vi.fn();
    render(<PublicCard mediaItem={media} actions={['favorites']} activeActions={['favorites']} onAction={onAction} />);
    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    fireEvent.click(screen.getByRole('button', { name: 'Remove from favorites' }));

    expect(onAction).toHaveBeenCalledWith('favorites', 'media-1');
  });

  it('fills the thumbnail heart when favorite state becomes active', () => {
    const { rerender } = render(
      <PublicCard mediaItem={media} actions={['favorites']} activeActions={[]} />,
    );
    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByRole('button', { name: 'Add to favorites' }).querySelector('svg'))
      .toHaveAttribute('fill', 'none');

    rerender(
      <PublicCard mediaItem={media} actions={['favorites']} activeActions={['favorites']} />,
    );

    expect(screen.getByRole('button', { name: 'Remove from favorites' }).querySelector('svg'))
      .toHaveAttribute('fill', 'currentColor');
  });
});

describe('PublicCard standard overlays', () => {
  it('holds price/actions until the thumbnail confirms loaded, then shows them', () => {
    render(<PublicCard mediaItem={media} actions={['cart']} activeActions={[]} />);

    expect(screen.queryByText(formatPrice(300))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    // The date is server data, not tied to the image load — visible immediately.
    expect(screen.getByText(formatCapturedAtDate(media.capturedAt))).toBeInTheDocument();

    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByText(formatPrice(300))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('renders the price badge, capture date, and thumbnail in normal mode', () => {
    render(<PublicCard mediaItem={media} actions={['cart']} activeActions={[]} />);
    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByText(formatPrice(300))).toBeInTheDocument();
    expect(screen.getByText(formatCapturedAtDate(media.capturedAt))).toBeInTheDocument();
    expect(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`)).toHaveAttribute('src', media.thumbnailUrl);
  });

  it('shows the full Purchased badge in normal mode', () => {
    render(<PublicCard mediaItem={media} showPurchasedBadge />);

    expect(screen.getByText('Purchased')).toBeInTheDocument();
  });
});

describe('PublicCard broken media', () => {
  it('drops the price and cart/favorites actions but keeps the capture date once the thumbnail fails', () => {
    render(<PublicCard mediaItem={media} actions={['cart', 'favorites', 'share', 'report']} activeActions={[]} />);

    fireEvent.error(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.queryByText(formatPrice(300))).not.toBeInTheDocument();
    expect(screen.getByText(formatCapturedAtDate(media.capturedAt))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to cart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to favorites' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
  });

  it('resets the broken verdict when the card is handed a different thumbnail url', () => {
    const { rerender } = render(<PublicCard mediaItem={media} actions={['cart']} activeActions={[]} />);

    fireEvent.error(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));
    expect(screen.queryByText(formatPrice(300))).not.toBeInTheDocument();

    const replacement = { ...media, thumbnailUrl: 'https://example.com/thumb-v2.jpg' };
    rerender(<PublicCard mediaItem={replacement} actions={['cart']} activeActions={[]} />);

    // The new url is unconfirmed — price/cart still withheld, not shown from stale loaded state.
    expect(screen.queryByText(formatPrice(300))).not.toBeInTheDocument();

    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByText(formatPrice(300))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeInTheDocument();
  });

  it('still shows the date on broken media even without a price', () => {
    render(<PublicCard mediaItem={{ ...media, price: null }} actions={['cart']} />);

    fireEvent.error(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByText(formatCapturedAtDate(media.capturedAt))).toBeInTheDocument();
  });
});

describe('PublicCard dense state glyph', () => {
  it('withholds the in-cart/favorited glyph until the thumbnail confirms loaded', () => {
    render(
      <PublicCard
        mediaItem={media}
        actions={['cart', 'favorites']}
        activeActions={['cart', 'favorites']}
        dense
      />,
    );

    expect(screen.queryByLabelText('In cart')).not.toBeInTheDocument();

    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByLabelText('In cart')).toBeInTheDocument();
  });

  it('shows one priority glyph (in-cart over favorited), no action buttons, no price', () => {
    render(
      <PublicCard
        mediaItem={media}
        actions={['cart', 'favorites']}
        activeActions={['cart', 'favorites']}
        dense
      />,
    );
    fireEvent.load(screen.getByAltText(`Surf photo from ${formatCapturedAtDate(media.capturedAt)}`));

    expect(screen.getByLabelText('In cart')).toBeInTheDocument();
    expect(screen.queryByLabelText('Favorited')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cart|favorit/i })).not.toBeInTheDocument();
    expect(screen.queryByText(formatPrice(300))).not.toBeInTheDocument();
  });

  it('ranks purchased above cart and favorited', () => {
    render(
      <PublicCard
        mediaItem={media}
        activeActions={['cart', 'favorites']}
        showPurchasedBadge
        dense
      />,
    );

    expect(screen.getByLabelText('Purchased')).toBeInTheDocument();
    expect(screen.queryByLabelText('In cart')).not.toBeInTheDocument();
  });

  it('renders no glyph when the tile has no active state', () => {
    render(<PublicCard mediaItem={media} actions={['cart', 'favorites']} activeActions={[]} dense />);

    expect(screen.queryByLabelText('In cart')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Favorited')).not.toBeInTheDocument();
  });
});
