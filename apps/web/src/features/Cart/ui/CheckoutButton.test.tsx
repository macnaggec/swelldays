import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CheckoutButton } from './CheckoutButton';

describe('CheckoutButton', () => {
  it('renders as a compact green glass panel action', () => {
    render(
      <CheckoutButton
        isPending={false}
        onCheckout={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /checkout/i })).toHaveAttribute(
      'data-panel-gallery-primary-action',
      'glass-green',
    );
    expect(screen.getByRole('button', { name: /checkout/i })).toHaveAttribute(
      'data-panel-gallery-primary-action-size',
      'compact',
    );
  });
});
