import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { UserControl } from './UserControl';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  user: {
    email: 'photographer@example.com',
    image: null,
    name: 'Swelldays',
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@mantine/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/core')>();
  const Menu = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Target: ({ children }: { children: ReactNode }) => <>{children}</>,
      Dropdown: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
      Item: ({
        children,
        color: _color,
        onClick,
      }: {
        children: ReactNode;
        color?: string;
        onClick?: () => void;
      }) => (
        <button type="button" role="menuitem" onClick={onClick}>
          {children}
        </button>
      ),
      Divider: () => <hr />,
    },
  );

  return {
    ...actual,
    Menu,
  };
});

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({
    user: mocks.user,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('features/Auth', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
}));

vi.mock('shared/lib/auth', () => ({
  signOut: vi.fn(),
}));

describe('UserControl', () => {
  it('opens the collection workspace from the authenticated user menu', async () => {
    render(<UserControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'My Collections' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/collections' });
  });

  it('opens the earnings panel from the authenticated user menu', async () => {
    render(<UserControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Earnings' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/earnings' });
  });

  it('opens the account page inside the user workspace', async () => {
    render(<UserControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Account' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me' });
  });
});
