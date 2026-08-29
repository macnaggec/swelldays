import { createFileRoute } from '@tanstack/react-router';
import { sessionPageDescription, sessionPageTitle } from '@swelldays/contracts/core';
import { trpcProxy } from 'shared/lib/trpcClient';
import { SessionDetail } from 'widgets/SidePanel';
import { formatDateRange, formatShortDate } from 'shared/lib/dateUtils';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/$spotId/session/$sessionId')({
  validateSearch: (search): { from?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  staticData: { appRouteIntent: 'routeWorkspace' },
  loader: async ({ context: { queryClient }, params }) =>
    queryClient.ensureQueryData(trpcProxy.sessions.byId.queryOptions(params.sessionId)),
  head: ({ loaderData, params }) => ({
    ...(loaderData && {
      meta: buildPageMeta({
        title: sessionPageTitle(loaderData, formatShortDate(loaderData.startsAt)),
        description: sessionPageDescription(loaderData, formatDateRange(loaderData.startsAt, loaderData.endsAt)),
      }),
    }),
    links: buildCanonicalLink(`/${params.spotId}/session/${params.sessionId}`),
  }),
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const session = Route.useLoaderData();
  if (!session) return null;
  return <SessionDetail session={session} />;
}
