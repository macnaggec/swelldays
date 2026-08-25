import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CheckoutButton } from './CheckoutButton';

describe('CheckoutButton', () => {
  it('renders through the shared positive button tone', () => {
    render(
      <CheckoutButton
        isPending={false}
        onCheckout={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /checkout/i }))
      .toHaveAttribute('data-app-button-tone', 'positive');
  });
});
