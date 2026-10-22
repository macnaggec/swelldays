import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import type { CartItem } from 'entities/Commerce';
import CartLightbox from './CartLightbox';

const item: CartItem = {
  id: 'cart-item-1',
  label: 'Green Bowl · Jul 17, 2026',
  spotName: 'Green Bowl',
  capturedAt: '2026-07-17T06:00:00.000Z',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  lightboxUrl: 'https://cdn.example.com/watermarked.jpg',
  priceCents: 300,
};

describe('CartLightbox', () => {
  it('removes the item and closes when the remove action is used', async () => {
    const onRemove = vi.fn();
    const onClose = vi.fn();
    render(<CartLightbox item={item} onClose={onClose} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove from cart' }));

    expect(onRemove).toHaveBeenCalledWith('cart-item-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('puts the spot, date, and price in the caption and the remove action in the floating action area', () => {
    render(<CartLightbox item={item} onClose={vi.fn()} onRemove={vi.fn()} />);

    const caption = screen.getByText('Green Bowl').closest('[data-lightbox-media-caption]');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain('$3.00');
    expect(screen.getByRole('button', { name: 'Remove from cart' }).closest(
      '[data-lightbox-floating-actions]',
    )).not.toBeNull();
  });

  it('cannot remove the item while cart interaction is disabled', async () => {
    const onRemove = vi.fn();
    const onClose = vi.fn();
    render(
      <CartLightbox
        item={item}
        onClose={onClose}
        onRemove={onRemove}
        disabled
      />,
    );

    const removeButton = screen.getByRole('button', { name: 'Remove from cart' });
    expect(removeButton).toBeDisabled();

    await userEvent.click(removeButton);

    expect(onRemove).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
