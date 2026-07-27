import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { CartControl } from './CartControl';

const mocks = vi.hoisted(() => ({
  count: 0,
  isAuthenticated: true,
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
    options.select({ location: { pathname: '/' }, matches: [] }),
}));

describe('CartControl', () => {
  it('shows the cart icon for an anonymous user when the cart has items', () => {
    mocks.count = 2;
    mocks.isAuthenticated = false;

    render(<CartControl />);

    expect(screen.getByRole('button', { name: /cart, 2 items/i })).toBeInTheDocument();
  });

  it('hides the cart icon when the cart is empty, regardless of auth', () => {
    mocks.count = 0;
    mocks.isAuthenticated = false;

    render(<CartControl />);

    expect(screen.queryByRole('button', { name: /cart,/i })).not.toBeInTheDocument();
  });
});
