import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { Route } from './_page.admin';

const payoutRequestId = '11111111-1111-4111-8111-111111111111';

type PayoutFixture = {
  id: string;
  amount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
  externalTransferId: string | null;
  note: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  photographer: {
    id: string;
    email: string;
    name: string | null;
  };
};

const mocks = vi.hoisted(() => {
  const payouts: PayoutFixture[] = [{
    id: '11111111-1111-4111-8111-111111111111',
    amount: 4500,
    status: 'PENDING',
    externalTransferId: null,
    note: null,
    requestedAt: new Date('2026-07-05T12:00:00.000Z'),
    processedAt: null,
    photographer: {
      id: 'photographer-1',
      email: 'photographer@example.com',
      name: 'Pipeline Shooter',
    },
  }];

  return {
    completePayout: vi.fn(),
    invalidateQueries: vi.fn(),
    isAuthenticated: true,
    isForbidden: false,
    isLoadingUser: false,
    isLoadingPayouts: false,
    isMutating: false,
    markProcessing: vi.fn(),
    payouts,
    rejectPayout: vi.fn(),
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({
    isAuthenticated: mocks.isAuthenticated,
    isLoading: mocks.isLoadingUser,
  }),
}));

vi.mock('features/Auth', () => ({
  LoginForm: () => (
    <form aria-label="Admin sign in">
      <label htmlFor="admin-email">Email</label>
      <input id="admin-email" name="email" />
      <label htmlFor="admin-password">Password</label>
      <input id="admin-password" name="password" type="password" />
      <button type="submit">Login</button>
    </form>
  ),
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mocks.payouts,
      isError: mocks.isForbidden,
      isLoading: mocks.isLoadingPayouts,
    }),
    useMutation: (options: { mutationKey?: string[] }) => {
      const key = options.mutationKey?.join('.');
      const mutateAsync =
        key === 'admin.ledger.complete'
          ? mocks.completePayout
          : key === 'admin.ledger.reject'
            ? mocks.rejectPayout
            : mocks.markProcessing;
      return { mutateAsync, isPending: mocks.isMutating };
    },
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    admin: {
      ledger: {
        complete: { mutationOptions: () => ({ mutationKey: ['admin', 'ledger', 'complete'] }) },
        listPayouts: {
          queryKey: () => ['admin', 'ledger', 'listPayouts'],
          queryOptions: () => ({ queryKey: ['admin', 'ledger', 'listPayouts'] }),
        },
        markProcessing: { mutationOptions: () => ({ mutationKey: ['admin', 'ledger', 'markProcessing'] }) },
        reject: { mutationOptions: () => ({ mutationKey: ['admin', 'ledger', 'reject'] }) },
      },
    },
  }),
}));

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.isForbidden = false;
    mocks.isLoadingUser = false;
    mocks.isLoadingPayouts = false;
    mocks.isMutating = false;
    mocks.payouts = [{
      id: payoutRequestId,
      amount: 4500,
      status: 'PENDING',
      externalTransferId: null,
      note: null,
      requestedAt: new Date('2026-07-05T12:00:00.000Z'),
      processedAt: null,
      photographer: {
        id: 'photographer-1',
        email: 'photographer@example.com',
        name: 'Pipeline Shooter',
      },
    }];
  });

  it('shows an inline auth form when the admin route is opened signed out', () => {
    mocks.isAuthenticated = false;
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(screen.queryByText('Admin payouts')).not.toBeInTheDocument();
  });

  it('shows the sign-in form to an authenticated non-admin instead of the admin shell', () => {
    mocks.isAuthenticated = true;
    mocks.isForbidden = true;
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByRole('form', { name: 'Admin sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Payouts' })).not.toBeInTheDocument();
    expect(screen.queryByText('Admin payouts')).not.toBeInTheDocument();
    expect(screen.queryByText('Internal operator tools for marketplace operations.')).not.toBeInTheDocument();
  });

  it('shows the tabbed payout console and lets an admin mark one processing', async () => {
    mocks.markProcessing.mockResolvedValue(undefined);
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByRole('tab', { name: 'Payouts' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Admin payouts' })).toBeInTheDocument();
    expect(screen.getByText('Pipeline Shooter')).toBeInTheDocument();
    expect(screen.getByText('photographer@example.com')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Mark processing' }));

    await waitFor(() => {
      expect(mocks.markProcessing).toHaveBeenCalledWith({ payoutRequestId });
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['admin', 'ledger', 'listPayouts'],
    });
  });

  it('splits payouts into a needs-action section and a history section below it', () => {
    mocks.payouts = [
      {
        id: payoutRequestId,
        amount: 4500,
        status: 'PENDING',
        externalTransferId: null,
        note: null,
        requestedAt: new Date('2026-07-05T12:00:00.000Z'),
        processedAt: null,
        photographer: {
          id: 'photographer-1',
          email: 'photographer@example.com',
          name: 'Pipeline Shooter',
        },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        amount: 3000,
        status: 'COMPLETED',
        externalTransferId: 'wise-ref-1',
        note: null,
        requestedAt: new Date('2026-07-01T12:00:00.000Z'),
        processedAt: new Date('2026-07-02T12:00:00.000Z'),
        photographer: {
          id: 'photographer-2',
          email: 'completed@example.com',
          name: 'Completed Shooter',
        },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        amount: 2500,
        status: 'REJECTED',
        externalTransferId: null,
        note: 'Invalid bank details',
        requestedAt: new Date('2026-07-03T12:00:00.000Z'),
        processedAt: new Date('2026-07-04T12:00:00.000Z'),
        photographer: {
          id: 'photographer-3',
          email: 'rejected@example.com',
          name: 'Rejected Shooter',
        },
      },
    ];
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByText('Needs action')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
    expect(screen.getByText('Pipeline Shooter')).toBeInTheDocument();
    expect(screen.getByText('Completed Shooter')).toBeInTheDocument();
    expect(screen.getByText('Rejected Shooter')).toBeInTheDocument();

    // History rows have no action buttons — they're already finalized.
    expect(screen.queryByRole('button', { name: 'Mark processing' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Complete' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);

    expect(screen.getByText('wise-ref-1')).toBeInTheDocument();
    expect(screen.getByText('Invalid bank details')).toBeInTheDocument();
  });
});
