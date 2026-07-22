import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { useTRPC } from 'shared/lib/trpc';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import {
  EarningsPanel,
  EarningsPanelError,
  EarningsPanelSkeleton,
  type EarningsSummary,
} from 'features/Ledger';

export const Route = createFileRoute('/_panel/me/earnings')({
  staticData: { panelHeader: 'Earnings' },
  component: EarningsRoute,
});

export function EarningsRoute() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const {
    data: summary,
    error,
    isLoading,
    refetch,
  } = useQuery(trpc.ledger.summary.queryOptions());
  const { mutateAsync: requestPayout, isPending: isRequestingPayout } = useMutation(
    trpc.ledger.requestPayout.mutationOptions(),
  );

  if (isLoading) {
    return (
      <PanelGalleryLayout>
        <EarningsPanelSkeleton />
      </PanelGalleryLayout>
    );
  }

  if (!summary) {
    return (
      <PanelGalleryLayout>
        <EarningsPanelError
          message={error ? getErrorMessage(error) : 'The earnings summary is unavailable.'}
          onRetry={() => { void refetch(); }}
        />
      </PanelGalleryLayout>
    );
  }

  const earningsSummary: EarningsSummary = {
    availableBalanceCents: summary.availableBalanceCents,
    pendingPayoutCents: summary.pendingPayoutCents,
    payoutThresholdCents: summary.payoutThresholdCents,
    payoutRequests: summary.payoutRequests.map((request) => ({
      id: request.id,
      amountCents: request.amount,
      status: request.status,
      requestedAt: request.requestedAt,
    })),
  };

  const handleRequestPayout = async () => {
    try {
      await requestPayout();
      await queryClient.invalidateQueries({ queryKey: trpc.ledger.summary.queryKey() });
      notify.success('Your payout request was created.', 'Payout Requested');
    } catch (error) {
      notify.error(getErrorMessage(error), 'Payout Request Failed');
    }
  };

  return (
    <PanelGalleryLayout>
      <EarningsPanel
        summary={earningsSummary}
        isRequestingPayout={isRequestingPayout}
        onRequestPayout={() => { void handleRequestPayout(); }}
      />
    </PanelGalleryLayout>
  );
}
