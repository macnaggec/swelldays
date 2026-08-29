import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SessionFeed } from 'widgets/SidePanel';
import { buildCanonicalLink } from 'shared/lib/seoMeta';
import { usePanelFeedLayoutReadyChange, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/$spotId/')({
  head: ({ params }) => ({ links: buildCanonicalLink(`/${params.spotId}`) }),
  component: SpotFeed,
});

function SpotFeed() {
  const { spotId } = Route.useParams();
  const { filters } = usePanelFilter();
  const onLayoutReadyChange = usePanelFeedLayoutReadyChange();
  const navigate = useNavigate();

  return (
    <SessionFeed
      spotId={spotId}
      filters={filters}
      onLayoutReadyChange={onLayoutReadyChange}
      onSessionClick={(session) =>
        void navigate({ to: '/$spotId/session/$sessionId', params: { spotId, sessionId: session.id } })
      }
    />
  );
}
