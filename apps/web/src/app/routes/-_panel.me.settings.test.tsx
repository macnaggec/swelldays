import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { Route } from './_panel.me.index';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  query: {
    data: undefined as unknown,
    error: null as unknown,
    isLoading: false,
  },
  user: {
    user: { name: 'Kai Holt', email: 'kai@example.com', image: null },
    isLoading: false,
    isAuthenticated: true,
  },
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  useNavigate: () => mocks.navigate,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => mocks.query,
    useMutation: () => ({ mutateAsync: mocks.deleteAccount, isPending: false }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    ledger: { summary: { queryOptions: () => ({}) } },
    users: { deleteAccount: { mutationOptions: () => ({}) } },
  }),
}));

vi.mock('shared/lib/auth', () => ({ signOut: mocks.signOut }));
vi.mock('shared/hooks/useUser', () => ({ useUser: () => mocks.user }));

const summary = (availableBalanceCents = 0) => ({
  availableBalanceCents,
  pendingPayoutCents: 0,
  payoutThresholdCents: 2000,
});

const renderRoute = () => {
  const Component = (Route as unknown as { component: ComponentType }).component;
  render(<Component />);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = { data: summary(), error: null, isLoading: false };
  mocks.user = {
    user: { name: 'Kai Holt', email: 'kai@example.com', image: null },
    isLoading: false,
    isAuthenticated: true,
  };
});

describe('AccountRoute', () => {
  it('shows who is signed in alongside the account controls', () => {
    renderRoute();

    expect(screen.getByText('Kai Holt')).toBeInTheDocument();
    expect(screen.getByText('kai@example.com')).toBeInTheDocument();
  });

  it('signs the deleted user out and returns them to the map', async () => {
    renderRoute();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete account' }),
    );

    await waitFor(() => expect(mocks.deleteAccount).toHaveBeenCalled());
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/' });
  });

  it('sends a photographer with a withdrawable balance to earnings instead', async () => {
    mocks.query = { data: summary(4500), error: null, isLoading: false };
    renderRoute();

    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Request payout instead' }),
    );

    expect(mocks.navigate).toHaveBeenCalledWith({ to: '/me/earnings' });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it('explains itself rather than going blank when the balance cannot be loaded', () => {
    mocks.query = { data: undefined, error: new Error('Ledger unavailable'), isLoading: false };
    renderRoute();

    expect(screen.getByText('Ledger unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });

  it('shows a skeleton shaped like the account page while it loads', () => {
    mocks.query = { data: undefined, error: null, isLoading: true };
    renderRoute();

    expect(screen.getByText('Loading your account')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete account' })).not.toBeInTheDocument();
  });
});
