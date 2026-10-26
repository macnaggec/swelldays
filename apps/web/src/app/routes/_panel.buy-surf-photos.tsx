import { createFileRoute } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { PublicDocument } from 'shared/ui/PublicDocument';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/buy-surf-photos')({
  staticData: { appRouteIntent: 'siteWorkspace' },
  loader: () => staticPublicDocument('buyer'),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
  component: BuyerLandingPage,
});

function BuyerLandingPage() {
  return <PublicDocument document={Route.useLoaderData()} />;
}
