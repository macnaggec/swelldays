import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CheckoutButton } from './CheckoutButton';

describe('CheckoutButton', () => {
  it('renders through the shared positive button tone', () => {
    render(
      <CheckoutButton
        isPending={false}
        status={null}
        onCheckout={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /checkout/i }))
      .toHaveAttribute('data-app-button-tone', 'positive');
  });

  it.each([
    [{ state: 'ready', orderId: 'order-1', checkoutUrl: 'https://pay.example' }, 'Resume checkout'],
    [{ state: 'failed', orderId: 'order-1', reason: 'order-failed' }, 'Try checkout again'],
    [{ state: 'processing', orderId: 'order-1' }, 'Checking payment…'],
    [{ state: 'paid', orderId: 'order-1' }, 'View purchases'],
  ] as const)('renders the server-derived action for %s', (status, label) => {
    render(<CheckoutButton isPending={false} status={status} onCheckout={vi.fn()} />);
    expect(screen.getByRole('button', { name: label })).toBeVisible();
  });
});
