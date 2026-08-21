import { createFileRoute, Outlet } from '@tanstack/react-router';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'entities/Identity';
import { PanelEmptyState } from 'shared/ui/PanelRouteLayout';

export const Route = createFileRoute('/_panel/me')({
  staticData: { appRouteIntent: 'siteWorkspace' },
  component: MeLayout,
});

function MeLayout() {
  const { isAuthenticated, isLoading } = useUser();
  const { open: openAuthModal } = useAuthModal();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <PanelEmptyState
        title="Sign in to view your workspace"
        description="Collections, earnings, and account tools are tied to your account."
        actionLabel="Sign in"
        onAction={openAuthModal}
      />
    );
  }

  return <Outlet />;
}
