import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { MenuControl } from './MenuControl';

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  navigate: vi.fn(),
  notifyError: vi.fn(),
  openAuthModal: vi.fn(),
  preloadAuthSurface: vi.fn(() => Promise.resolve()),
  preloadRoute: vi.fn(),
  signOut: vi.fn(),
  user: {
    email: 'photographer@example.com',
    image: null,
    name: 'Swelldays',
  },
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ preloadRoute: mocks.preloadRoute }),
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
        onPointerEnter,
        onPointerDown,
        onFocus,
      }: {
        children: ReactNode;
        color?: string;
        onClick?: () => void;
        onPointerEnter?: () => void;
        onPointerDown?: () => void;
        onFocus?: () => void;
      }) => (
        <button
          type="button"
          role="menuitem"
          onClick={onClick}
          onPointerEnter={onPointerEnter}
          onPointerDown={onPointerDown}
          onFocus={onFocus}
        >
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
    isAuthenticated: mocks.isAuthenticated,
    isLoading: mocks.isLoading,
  }),
}));

vi.mock('features/Auth', () => ({
  useAuthModal: () => ({ open: mocks.openAuthModal }),
  preloadAuthSurface: mocks.preloadAuthSurface,
}));

vi.mock('shared/lib/auth', () => ({
  signOut: mocks.signOut,
}));

vi.mock('shared/lib/notifications', () => ({
  notify: {
    error: mocks.notifyError,
  },
}));

describe('MenuControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.isLoading = false;
    mocks.preloadRoute.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('preloads authenticated menu destinations from pointer, touch-pointer, and focus intent', () => {
    render(<MenuControl />);

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.pointerEnter(trigger);
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.focus(trigger);

    expect(mocks.preloadRoute.mock.calls).toEqual([
      [{ to: '/about' }],
      [{ to: '/me/collections' }],
      [{ to: '/me/earnings' }],
      [{ to: '/me' }],
      [{ to: '/about' }],
      [{ to: '/me/collections' }],
      [{ to: '/me/earnings' }],
      [{ to: '/me' }],
      [{ to: '/about' }],
      [{ to: '/me/collections' }],
      [{ to: '/me/earnings' }],
      [{ to: '/me' }],
    ]);
    expect(mocks.preloadAuthSurface).not.toHaveBeenCalled();
  });

  it('preloads the authentication surface from the signed-out "Sign in" menu item on pointer and focus intent', () => {
    mocks.isAuthenticated = false;
    render(<MenuControl />);

    const signIn = screen.getByRole('menuitem', { name: 'Sign in' });
    fireEvent.pointerEnter(signIn);
    fireEvent.pointerDown(signIn);
    fireEvent.focus(signIn);

    expect(mocks.preloadAuthSurface).toHaveBeenCalledTimes(3);
  });

  it('preloads only About for a signed-out visitor', () => {
    mocks.isAuthenticated = false;
    render(<MenuControl />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open menu' }));

    expect(mocks.preloadRoute).toHaveBeenCalledOnce();
    expect(mocks.preloadRoute).toHaveBeenCalledWith({ to: '/about' });
  });

  it('settles rejected menu preloads and still navigates from the menu', async () => {
    mocks.preloadRoute.mockRejectedValue(new Error('Route preload failed'));
    render(<MenuControl />);

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'My Collections' }));

    expect(mocks.preloadRoute).toHaveBeenCalledTimes(4);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/collections' });
  });

  it('opens sign in from the signed-out menu', async () => {
    mocks.isAuthenticated = false;
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign in' }));

    expect(mocks.openAuthModal).toHaveBeenCalledOnce();
  });

  it('opens the collection workspace from the authenticated menu', async () => {
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'My Collections' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/collections' });
  });

  it('opens the earnings panel from the authenticated menu', async () => {
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Earnings' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/earnings' });
  });

  it('opens the account page from the authenticated menu', async () => {
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Account' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me' });
  });

  it('opens the About page regardless of sign-in state', async () => {
    mocks.isAuthenticated = false;
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'About' }));

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/about' });
  });

  it('returns to Browse after signing out successfully', async () => {
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledOnce();
      expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
    });
    expect(mocks.notifyError).not.toHaveBeenCalled();
  });

  it('shows a retryable error instead of failing silently when sign-out is rejected', async () => {
    mocks.signOut.mockResolvedValue({
      data: null,
      error: { message: 'Invalid origin', status: 403, statusText: 'Forbidden' },
    });
    render(<MenuControl />);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith(
        "We couldn't sign you out. Please try again.",
        'Sign Out Failed',
      );
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
