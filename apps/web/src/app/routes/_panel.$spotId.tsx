import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { spotPageDescription, spotPageTitle } from '@swelldays/contracts';
import { trpcProxy } from 'shared/lib/trpcClient';
import { buildPageMeta } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/$spotId')({
  loader: async ({ params: { spotId }, context: { queryClient } }) => {
    const spot = await queryClient.ensureQueryData(trpcProxy.spots.byId.queryOptions(spotId));
    if (!spot) throw redirect({ to: '/' });
    return spot;
  },
  head: ({ loaderData }) => ({
    ...(loaderData && {
      meta: buildPageMeta({
        title: spotPageTitle(loaderData),
        description: spotPageDescription(loaderData),
      }),
    }),
  }),
  component: () => <Outlet />,
});
