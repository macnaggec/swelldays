import { createFileRoute } from '@tanstack/react-router';
import { trpcProxy } from 'shared/lib/trpcClient';
import { SessionDetail } from 'widgets/SidePanel';

export const Route = createFileRoute('/_panel/$spotId/session/$sessionId')({
  validateSearch: (search): { from?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  staticData: { appRouteIntent: 'routeWorkspace' },
  loader: async ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(trpcProxy.sessions.byId.queryOptions(params.sessionId)),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const session = Route.useLoaderData();
  if (!session) return null;
  return <SessionDetail session={session} />;
}
