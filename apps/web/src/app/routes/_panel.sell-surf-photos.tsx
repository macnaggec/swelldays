import { createFileRoute } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { PublicDocument } from 'shared/ui/PublicDocument';
import { buildPublicDocumentHead } from 'shared/lib/seoMeta';

export const Route = createFileRoute('/_panel/sell-surf-photos')({
  staticData: { appRouteIntent: 'siteWorkspace' },
  loader: () => staticPublicDocument('seller'),
  head: ({ loaderData }) => loaderData ? buildPublicDocumentHead(loaderData) : {},
  component: SellerLandingPage,
});

function SellerLandingPage() {
  return <PublicDocument document={Route.useLoaderData()} />;
}
