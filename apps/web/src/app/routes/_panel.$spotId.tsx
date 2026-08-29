import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { spotPageDescription, spotPageTitle } from '@swelldays/contracts/core';
import { trpcProxy } from 'shared/lib/trpcClient';
import { buildPageMeta } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/$spotId')({
  // The $spotId URL segment is the spot's slug (e.g. "uluwatu"), not its
  // database id — a raw id in this position no longer resolves, by design.
  loader: async ({ params: { spotId: spotSlug }, context: { queryClient } }) => {
    const spot = await queryClient.ensureQueryData(trpcProxy.spots.bySlug.queryOptions(spotSlug));
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
