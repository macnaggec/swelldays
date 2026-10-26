import { createFileRoute, useMatch, useNavigate } from '@tanstack/react-router';
import { SessionFeed } from 'widgets/SidePanel';
import { loadSpotDocument } from 'app/lib/publicDocuments';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';
import { usePanelFeedLayoutReadyChange, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/$spotId/')({
  loader: ({ context: { queryClient }, params }) => loadSpotDocument(queryClient, params.spotId, false),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
  component: SpotFeed,
});

function SpotFeed() {
  const { spotId } = Route.useParams();
  // SessionFeed filters by the spot's database id, not its slug — the
  // parent route (/_panel/$spotId) already resolved that from the slug.
  const spot = useMatch({ from: '/_panel/$spotId', select: (match) => match.loaderData });
  const { filters } = usePanelFilter();
  const onLayoutReadyChange = usePanelFeedLayoutReadyChange();
  const navigate = useNavigate();

  return (
    <SessionFeed
      spotId={spot?.id}
      filters={filters}
      onLayoutReadyChange={onLayoutReadyChange}
      onSessionClick={(session) =>
        void navigate({ to: '/$spotId/session/$sessionId', params: { spotId, sessionId: session.id } })
      }
    />
  );
}
