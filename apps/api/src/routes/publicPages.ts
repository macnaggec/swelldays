import { Hono } from 'hono';
import { z } from 'zod';
import {
  ABOUT_PAGE_DESCRIPTION,
  ABOUT_PAGE_TITLE,
  GALLERY_PAGE_DESCRIPTION,
  GALLERY_PAGE_TITLE,
  HOME_PAGE_DESCRIPTION,
  HOME_PAGE_TITLE,
  sessionPageDescription,
  sessionPageTitle,
  spotGalleryDescription,
  spotGalleryTitle,
  spotPageDescription,
  spotPageTitle,
} from '@swelldays/contracts/core';
import { apiConfig } from 'server/config/env';
import { spotRepository } from 'server/repositories/SpotRepository';
import { surfSessionRepository } from 'server/repositories/SurfSessionRepository';
import { injectHead } from 'server/lib/htmlHead';
import { breadcrumbListJsonLd, placeJsonLd } from 'server/lib/seoJsonLd';
import { buildSitemapXml, type SitemapEntry } from 'server/lib/sitemapXml';

/**
 * Server-rendered metadata for the public content routes (Phase 2 of
 * docs/roadmaps/seo-optimization.md). These mirror the web app's real public
 * URLs so an edge proxy can route crawler/share-bot traffic here without any
 * path rewriting — see that roadmap for the still-open Caddy-side dependency.
 */

function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Mirrors apps/web/src/shared/lib/dateUtils.ts's formatDateRange. Duplicated
// rather than imported because that module is a browser-side utility with no
// existing shared home, and this is the only server-side caller.
function formatDateRangeLabel(startsAt: Date, endsAt: Date): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} · ${startTime}–${endTime}`;
}

async function fetchAppShell(): Promise<string> {
  const response = await fetch(new URL('/index.html', apiConfig.frontendOrigin));
  if (!response.ok) throw new Error(`Failed to fetch app shell (${response.status})`);
  return response.text();
}

function canonicalUrl(path: string): string {
  return new URL(path, apiConfig.frontendOrigin).toString();
}

// One page of published sessions per round trip while walking every session
// site-wide for the sitemap — large enough to keep the walk short, well under
// any pagination limit the repository itself enforces elsewhere.
const SITEMAP_SESSION_PAGE_SIZE = 200;

async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [
    { loc: canonicalUrl('/') },
    { loc: canonicalUrl('/about') },
    { loc: canonicalUrl('/gallery') },
  ];

  const seenSpotSlugs = new Set<string>();
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await surfSessionRepository.listPublished({ cursor, limit: SITEMAP_SESSION_PAGE_SIZE });

    for (const session of page.items) {
      entries.push({ loc: canonicalUrl(`/${session.spot.slug}/session/${session.id}`), lastmod: session.createdAt });

      // Sessions arrive newest-first, so the first one seen for a spot is
      // that spot's most recent content — a reasonable lastmod for its
      // own page and gallery without a second query.
      if (!seenSpotSlugs.has(session.spot.slug)) {
        seenSpotSlugs.add(session.spot.slug);
        entries.push({ loc: canonicalUrl(`/${session.spot.slug}`), lastmod: session.createdAt });
        entries.push({ loc: canonicalUrl(`/${session.spot.slug}/gallery`), lastmod: session.createdAt });
      }
    }

    cursor = page.nextCursor ?? undefined;
    hasMore = page.nextCursor !== null;
  }

  return entries;
}

export const publicPagesRouter = new Hono();

// api.swelldays.surf is a separate origin from the web app's own robots.txt
// (apps/web/public/robots.txt). Nothing on this origin is meant for search
// results directly: the page routes below exist only to mirror the web app's
// metadata for crawlers/share-bots (their canonical tag already points back
// to the real swelldays.surf URL), and everything else here is a JSON/tRPC
// API endpoint that was never meant to be indexed at all.
publicPagesRouter.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

publicPagesRouter.get('/sitemap.xml', async (c) => {
  const entries = await collectSitemapEntries();
  return c.body(buildSitemapXml(entries), 200, { 'Content-Type': 'application/xml; charset=UTF-8' });
});

publicPagesRouter.get('/', async (c) => {
  const shell = await fetchAppShell();
  return c.html(injectHead(shell, {
    title: HOME_PAGE_TITLE,
    description: HOME_PAGE_DESCRIPTION,
    canonicalUrl: canonicalUrl('/'),
  }));
});

publicPagesRouter.get('/about', async (c) => {
  const shell = await fetchAppShell();
  return c.html(injectHead(shell, {
    title: ABOUT_PAGE_TITLE,
    description: ABOUT_PAGE_DESCRIPTION,
    canonicalUrl: canonicalUrl('/about'),
  }));
});

publicPagesRouter.get('/gallery', async (c) => {
  const shell = await fetchAppShell();
  return c.html(injectHead(shell, {
    title: GALLERY_PAGE_TITLE,
    description: GALLERY_PAGE_DESCRIPTION,
    canonicalUrl: canonicalUrl('/gallery'),
  }));
});

// The URL segment named :spotId here is a spot's slug, not its database id —
// named to match the identical (also slug-holding) TanStack Router param in
// apps/web, since this route exists purely to mirror that real public URL.
publicPagesRouter.get('/:spotId', async (c) => {
  const spotSlug = c.req.param('spotId');
  const [spot, shell] = await Promise.all([spotRepository.findSpotBySlug(spotSlug), fetchAppShell()]);
  if (!spot) return c.html(shell, 404);

  const { items } = await surfSessionRepository.listPublished({ spotId: spot.id, limit: 1 });
  return c.html(injectHead(shell, {
    title: spotPageTitle(spot),
    description: spotPageDescription(spot),
    canonicalUrl: canonicalUrl(`/${spot.slug}`),
    imageUrl: items[0]?.thumbnailUrl ?? undefined,
    jsonLd: [placeJsonLd(spot)],
  }));
});

publicPagesRouter.get('/:spotId/gallery', async (c) => {
  const spotSlug = c.req.param('spotId');
  const [spot, shell] = await Promise.all([spotRepository.findSpotBySlug(spotSlug), fetchAppShell()]);
  if (!spot) return c.html(shell, 404);

  const { items } = await surfSessionRepository.listPublished({ spotId: spot.id, limit: 1 });
  return c.html(injectHead(shell, {
    title: spotGalleryTitle(spot),
    description: spotGalleryDescription(spot),
    canonicalUrl: canonicalUrl(`/${spot.slug}/gallery`),
    imageUrl: items[0]?.thumbnailUrl ?? undefined,
    jsonLd: [
      placeJsonLd(spot),
      breadcrumbListJsonLd([
        { name: 'Swelldays', url: canonicalUrl('/') },
        { name: spot.name, url: canonicalUrl(`/${spot.slug}`) },
        { name: 'Gallery', url: canonicalUrl(`/${spot.slug}/gallery`) },
      ]),
    ],
  }));
});

publicPagesRouter.get('/:spotId/session/:sessionId', async (c) => {
  const spotSlug = c.req.param('spotId');
  const sessionId = c.req.param('sessionId');
  const shell = await fetchAppShell();

  if (!z.uuid().safeParse(sessionId).success) return c.html(shell, 404);

  const session = await surfSessionRepository.findPublishedById(sessionId);
  if (!session) return c.html(shell, 404);

  const shortDate = formatShortDate(session.startsAt);
  return c.html(injectHead(shell, {
    title: sessionPageTitle(session, shortDate),
    description: sessionPageDescription(session, formatDateRangeLabel(session.startsAt, session.endsAt)),
    canonicalUrl: canonicalUrl(`/${spotSlug}/session/${sessionId}`),
    imageUrl: session.thumbnailUrl ?? undefined,
    jsonLd: [
      breadcrumbListJsonLd([
        { name: 'Swelldays', url: canonicalUrl('/') },
        { name: session.spot.name, url: canonicalUrl(`/${session.spot.slug}`) },
        { name: `Session — ${shortDate}`, url: canonicalUrl(`/${spotSlug}/session/${sessionId}`) },
      ]),
    ],
  }));
});
