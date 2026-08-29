import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { HOME_PAGE_DESCRIPTION, HOME_PAGE_TITLE } from '@swelldays/contracts';
import { SessionFeed } from 'widgets/SidePanel';
import { buildCanonicalLink, buildPageMeta } from 'shared/lib/seoMeta';
import { usePanelFeedLayoutReadyChange, usePanelFilter } from '../lib/panelContexts';

export const Route = createFileRoute('/_panel/')({
  staticData: { panelHeader: 'Recent Sessions' },
  head: () => ({
    meta: buildPageMeta({ title: HOME_PAGE_TITLE, description: HOME_PAGE_DESCRIPTION }),
    links: buildCanonicalLink('/'),
  }),
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
        void navigate({ to: '/$spotId/session/$sessionId', params: { spotId: session.spotId, sessionId: session.id } })
      }
    />
  );
}
