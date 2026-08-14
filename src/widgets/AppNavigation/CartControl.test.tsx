import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CartControl } from './CartControl';

const mocks = vi.hoisted(() => ({
  count: 0,
  isAuthenticated: true,
  pathname: '/',
}));

vi.mock('entities/Commerce', () => ({
  useCartStore: (selector: (state: { items: unknown[] }) => unknown) =>
    selector({ items: Array.from({ length: mocks.count }) }),
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: (options: { select: (s: unknown) => unknown }) =>
    options.select({ location: { pathname: mocks.pathname }, matches: [] }),
}));

describe('CartControl', () => {
  it('shows the cart icon for an anonymous user when the cart has items', () => {
    mocks.count = 2;
    mocks.isAuthenticated = false;

    render(<CartControl />);

    expect(screen.getByRole('button', { name: /cart, 2 items/i })).toBeInTheDocument();
  });

  it('keeps the cart icon visible but dimmed when the cart is empty, regardless of auth', () => {
    mocks.count = 0;
    mocks.isAuthenticated = false;

    render(<CartControl />);

    const button = screen.getByRole('button', { name: /cart,/i });
    expect(button).toBeInTheDocument();
    expect(button.style.opacity).toBe('0.4');
  });

  it.each([
    ['/cart', 'true'],
    ['/spots/example', 'false'],
  ] as const)('exposes whether the cart destination is current at %s', (pathname, expectedPressed) => {
    mocks.pathname = pathname;

    render(<CartControl />);

    expect(screen.getByRole('button', { name: /cart,/i })).toHaveAttribute(
      'aria-pressed',
      expectedPressed,
    );
  });
});
