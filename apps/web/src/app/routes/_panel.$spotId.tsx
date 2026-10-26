import { createFileRoute, Outlet, notFound } from '@tanstack/react-router';
import { spotPageDescription, spotPageTitle } from '@swelldays/contracts/core';
import { trpcProxy } from 'shared/lib/trpcClient';
import { requireCanonicalSession } from 'app/lib/publicDocuments';
import { buildPageMeta } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/$spotId')({
  // The $spotId URL segment is the spot's slug (e.g. "uluwatu"), not its
  // database id — a raw id in this position no longer resolves, by design.
  loader: async ({ params: { spotId: spotSlug }, context: { queryClient }, location }) => {
    const parts = location.pathname.split('/');
    if (parts[2] === 'session') {
      const sessionId = parts[3];
      if (!sessionId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sessionId)) throw notFound();
      const session = await queryClient.ensureQueryData(trpcProxy.sessions.byId.queryOptions(sessionId));
      requireCanonicalSession(session, spotSlug);
    }
    const spot = await queryClient.ensureQueryData(trpcProxy.spots.bySlug.queryOptions(spotSlug));
    if (!spot) throw notFound();
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
