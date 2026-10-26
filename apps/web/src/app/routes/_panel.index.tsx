import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { SessionFeed } from 'widgets/SidePanel';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';
import { usePanelFeedLayoutReadyChange, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/')({
  staticData: { panelHeader: 'Recent Sessions' },
  loader: () => staticPublicDocument('home'),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
  component: DefaultFeed,
});

function DefaultFeed() {
  const { filters } = usePanelFilter();
  const onLayoutReadyChange = usePanelFeedLayoutReadyChange();
  const navigate = useNavigate();

  return (
    <SessionFeed
      filters={filters}
      onLayoutReadyChange={onLayoutReadyChange}
      onSessionClick={(session) =>
        void navigate({ to: '/$spotId/session/$sessionId', params: { spotId: session.spot.slug, sessionId: session.id } })
      }
    />
  );
}
