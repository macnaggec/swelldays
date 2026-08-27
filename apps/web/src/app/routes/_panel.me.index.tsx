import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Text } from '@mantine/core';
import { PanelGalleryLayout } from 'shared/ui/PanelGalleryLayout';
import { AccountPanel, AccountPanelSkeleton } from 'features/Account';
import { useUser } from 'shared/hooks/useUser';
import { useTRPC } from 'shared/lib/trpc';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { signOut } from 'shared/lib/auth';

export const Route = createFileRoute('/_panel/me/')({
  staticData: { panelHeader: 'Account' },
  component: AccountRoute,
});

function AccountRoute() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { user, isLoading: isLoadingUser } = useUser();
  const { data: summary, error, isLoading } = useQuery(trpc.ledger.summary.queryOptions());
  const { mutateAsync: deleteAccount, isPending: isDeleting } = useMutation(
    trpc.users.deleteAccount.mutationOptions(),
  );

  const handleDelete = async () => {
    try {
      await deleteAccount();
      await signOut();
      await navigate({ to: '/' });
      notify.success('Your account has been deleted.', 'Account Deleted');
    } catch (error) {
      notify.error(getErrorMessage(error), 'Account Deletion Failed');
    }
  };

  if (isLoading || isLoadingUser) {
    return (
      <PanelGalleryLayout>
        <AccountPanelSkeleton />
      </PanelGalleryLayout>
    );
  }

  // Without the ledger summary we cannot tell the user what deleting forfeits,
  // so surface the failure instead of offering an uninformed delete.
  if (!summary || !user) {
    return (
      <PanelGalleryLayout>
        <Text c="dimmed" size="sm">
          {error ? getErrorMessage(error) : 'Your account details are unavailable.'}
        </Text>
      </PanelGalleryLayout>
    );
  }

  return (
    <PanelGalleryLayout>
      <AccountPanel
        identity={{ name: user.name ?? null, email: user.email, image: user.image }}
        availableBalanceCents={summary.availableBalanceCents}
        pendingPayoutCents={summary.pendingPayoutCents}
        payoutThresholdCents={summary.payoutThresholdCents}
        isDeleting={isDeleting}
        onDelete={() => { void handleDelete(); }}
        onRequestPayout={() => { void navigate({ to: '/me/earnings' }); }}
      />
    </PanelGalleryLayout>
  );
}
