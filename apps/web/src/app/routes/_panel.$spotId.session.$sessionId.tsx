import { createFileRoute, notFound } from '@tanstack/react-router';
import { sessionPublicDocument } from '@swelldays/contracts/core';
import { trpcProxy } from 'shared/lib/trpcClient';
import { SessionDetail } from 'widgets/SessionDetail';
import { requireCanonicalSession } from 'app/lib/publicDocuments';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/$spotId/session/$sessionId')({
  validateSearch: (search): { from?: string } => ({
    from: typeof search.from === 'string' ? search.from : undefined,
  }),
  staticData: { appRouteIntent: 'routeWorkspace' },
  loader: async ({ context: { queryClient }, params }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(params.sessionId)) throw notFound();
    return requireCanonicalSession(await queryClient.ensureQueryData(trpcProxy.sessions.byId.queryOptions(params.sessionId)), params.spotId);
  },
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(sessionPublicDocument(loaderData)) : {},
  component: SessionDetailPage,
});

function SessionDetailPage() {
  const session = Route.useLoaderData();
  if (!session) return null;
  return <SessionDetail session={session} />;
}
