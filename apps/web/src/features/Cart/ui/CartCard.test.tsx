import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CartItem } from 'entities/Commerce';
import { render } from 'test/setup/render';
import CartCard from './CartCard';

const item: CartItem = {
  id: 'cart-item-1',
  label: 'Green Bowl · Jul 17, 2026',
  spotName: 'Green Bowl',
  capturedAt: '2026-07-17T06:00:00.000Z',
  thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
  lightboxUrl: 'https://cdn.example.com/watermarked.jpg',
  priceCents: 300,
};

describe('CartCard', () => {
  it('uses the gallery action circle for its remove control', () => {
    render(<CartCard item={item} onRemove={vi.fn()} />);

    const removeButton = screen.getByRole('button', {
      name: 'Remove Green Bowl · Jul 17, 2026 from cart',
    });

    expect(removeButton.style.getPropertyValue('--ai-radius'))
      .toBe('var(--mantine-radius-xl)');
  });

  it('cannot remove or open an item while cart interaction is disabled', async () => {
    const onRemove = vi.fn();
    const onClick = vi.fn();
    render(<CartCard item={item} onRemove={onRemove} onClick={onClick} disabled />);

    const removeButton = screen.getByRole('button', {
      name: 'Remove Green Bowl · Jul 17, 2026 from cart',
    });
    expect(removeButton).toBeDisabled();

    await userEvent.click(removeButton);
    await userEvent.click(screen.getByRole('img', { name: item.label }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
