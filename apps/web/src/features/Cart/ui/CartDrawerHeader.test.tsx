import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CartDrawerHeader } from './CartDrawerHeader';

describe('CartDrawerHeader', () => {
  it('shows the originating spot on the left and keeps the cart title centered without a close button', () => {
    render(<CartDrawerHeader itemCount={3} spotName="Malibu" onBack={vi.fn()} />);

    const spotLink = screen.getByRole('button', { name: /malibu/i });
    const title = screen.getByText('Cart (3)');

    expect(screen.queryByRole('button', { name: /close cart/i })).not.toBeInTheDocument();
    expect(spotLink.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spotLink.parentElement).not.toBe(title.parentElement);
  });

  it('shows a feed back button when there is no originating spot', () => {
    render(<CartDrawerHeader itemCount={1} onBack={vi.fn()} />);

    expect(screen.getByRole('button', { name: /back to feed/i })).toBeInTheDocument();
  });
});
