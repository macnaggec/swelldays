import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { trpcProxy } from 'shared/lib/trpcClient';

export const Route = createFileRoute('/_panel/$spotId')({
  loader: async ({ params: { spotId }, context: { queryClient } }) => {
    const spot = await queryClient.ensureQueryData(trpcProxy.spots.byId.queryOptions(spotId));
    if (!spot) throw redirect({ to: '/' });
  },
  component: () => <Outlet />,
});
