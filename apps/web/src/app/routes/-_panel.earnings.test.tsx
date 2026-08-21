import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { EarningsRoute } from './_panel.me.earnings';

const mocks = vi.hoisted(() => {
  const createSummary = () => ({
    availableBalanceCents: 4500,
    pendingPayoutCents: 2200,
    payoutThresholdCents: 2000,
    recentTransactions: [],
    payoutRequests: [
      {
        id: 'payout-processing',
        amount: 1500,
        status: 'PROCESSING',
        externalTransferId: null,
        note: null,
        requestedAt: new Date('2026-07-05T12:00:00.000Z'),
        processedAt: null,
      },
      {
        id: 'payout-pending',
        amount: 700,
        status: 'PENDING',
        externalTransferId: null,
        note: null,
        requestedAt: new Date('2026-07-05T11:00:00.000Z'),
        processedAt: null,
      },
    ],
  });
  const errorState: { error: Error | null } = { error: null };
  const summaryState: { summary: ReturnType<typeof createSummary> | undefined } = {
    summary: createSummary(),
  };

  return {
    createSummary,
    ...errorState,
    isError: false,
    isLoading: false,
    isRequestingPayout: false,
    invalidateQueries: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    refetch: vi.fn(),
    requestPayout: vi.fn(),
    ...summaryState,
  };
});

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQuery: () => ({
      data: mocks.summary,
      error: mocks.error,
      isError: mocks.isError,
      isLoading: mocks.isLoading,
      refetch: mocks.refetch,
    }),
    useMutation: () => ({
      mutateAsync: mocks.requestPayout,
      isPending: mocks.isRequestingPayout,
    }),
    useQueryClient: () => ({
      invalidateQueries: mocks.invalidateQueries,
    }),
  };
});

vi.mock('shared/lib/trpc', () => ({
  useTRPC: () => ({
    ledger: {
      summary: {
        queryKey: () => ['ledger', 'summary'],
        queryOptions: () => ({ queryKey: ['ledger', 'summary'] }),
      },
      requestPayout: {
        mutationOptions: () => ({}),
      },
    },
  }),
}));

vi.mock('shared/lib/notifications', () => ({
  notify: {
    error: mocks.notifyError,
    success: mocks.notifySuccess,
  },
}));

describe('EarningsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.error = null;
    mocks.isError = false;
    mocks.isLoading = false;
    mocks.isRequestingPayout = false;
    mocks.summary = mocks.createSummary();
  });

  it('shows the photographer ledger summary from the server', () => {
    render(<EarningsRoute />);

    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('$22.00')).toBeInTheDocument();
    expect(screen.getByText('Payouts unlock at $20.00.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request payout' })).toBeEnabled();
    expect(screen.getByText('Payout history')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows a recognizable earnings skeleton while the ledger loads', () => {
    mocks.isLoading = true;
    render(<EarningsRoute />);

    expect(screen.getByText('Loading your earnings')).toBeInTheDocument();
  });

  it('lets the photographer retry when the ledger cannot load', async () => {
    mocks.error = new Error('Ledger unavailable');
    mocks.isError = true;
    mocks.summary = undefined;
    render(<EarningsRoute />);

    expect(screen.getByText('Unable to load earnings')).toBeInTheDocument();
    expect(screen.getByText('Ledger unavailable')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mocks.refetch).toHaveBeenCalledWith();
  });

  it('keeps cached earnings visible when a background refresh fails', () => {
    mocks.error = new Error('Ledger unavailable');
    mocks.isError = true;
    render(<EarningsRoute />);

    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.queryByText('Unable to load earnings')).not.toBeInTheDocument();
  });

  it('disables payout requests below the server threshold', () => {
    const summary = mocks.createSummary();
    mocks.summary = {
      ...summary,
      availableBalanceCents: 1999,
      pendingPayoutCents: 0,
      payoutRequests: [],
    };
    render(<EarningsRoute />);

    expect(screen.getByText('$19.99')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request payout' })).toBeDisabled();
    expect(screen.getByText('Payout requests will appear here.')).toBeInTheDocument();
  });

  it('requests payout and refreshes the visible ledger summary', async () => {
    mocks.requestPayout.mockResolvedValue(mocks.summary);
    render(<EarningsRoute />);

    await userEvent.click(screen.getByRole('button', { name: 'Request payout' }));

    await waitFor(() => {
      expect(mocks.requestPayout).toHaveBeenCalledWith();
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['ledger', 'summary'],
    });
    expect(mocks.notifySuccess).toHaveBeenCalledWith(
      'Your payout request was created.',
      'Payout Requested',
    );
  });

  it('shows an error notification when payout request fails', async () => {
    mocks.requestPayout.mockRejectedValue(new Error('Minimum payout is $20.00'));
    render(<EarningsRoute />);

    await userEvent.click(screen.getByRole('button', { name: 'Request payout' }));

    await waitFor(() => {
      expect(mocks.notifyError).toHaveBeenCalledWith(
        'Minimum payout is $20.00',
        'Payout Request Failed',
      );
    });
  });
});
