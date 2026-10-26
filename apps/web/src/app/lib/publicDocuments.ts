import type { QueryClient } from '@tanstack/react-query';
import { notFound, redirect } from '@tanstack/react-router';
import { spotPublicDocument, type SurfSessionItem } from '@swelldays/contracts/core';
import { sessionFeedInfiniteQueryOptions } from 'entities/SurfSession';
import { trpcProxy } from 'shared/lib/trpcClient';

export async function loadPublicSessions(queryClient: QueryClient, spotId?: string, cursor?: string) {
  if (cursor) return queryClient.ensureQueryData(trpcProxy.sessions.list.queryOptions({ limit: 20, cursor }));
  const data = await queryClient.ensureInfiniteQueryData(sessionFeedInfiniteQueryOptions(trpcProxy, { spotId }));
  const page = data.pages[0];
  if (!page) throw new Error('Published sessions unavailable');
  return page;
}

export function requireCanonicalSession(session: SurfSessionItem | null, slug: string): SurfSessionItem {
  if (!session) throw notFound();
  if (session.spot.slug !== slug) throw redirect({
    to: '/$spotId/session/$sessionId', params: { spotId: session.spot.slug, sessionId: session.id }, replace: true,
  });
  return session;
}

export async function loadSpotDocument(queryClient: QueryClient, slug: string, gallery: boolean) {
  const spot = await queryClient.ensureQueryData(trpcProxy.spots.bySlug.queryOptions(slug));
  if (!spot) throw notFound();
  const page = await loadPublicSessions(queryClient, spot.id);
  return spotPublicDocument(spot, gallery, page.items);
}
