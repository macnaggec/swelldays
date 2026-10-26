import { Hono } from 'hono';
import { z } from 'zod';
import {
  isPublicSpotSlug, staticPublicDocument, spotPublicDocument, sessionPublicDocument,
  publicCanonical, type PublicDocument, type StaticPublicPage,
} from '@swelldays/contracts/core';
import { apiConfig } from 'server/config/env';
import { spotRepository } from 'server/repositories/SpotRepository';
import { surfSessionRepository } from 'server/repositories/SurfSessionRepository';
import { injectHead } from 'server/lib/htmlHead';
import { firstVisitHtml } from 'server/lib/firstVisitHtml';
import { injectInitialBody, injectPublicDocument } from 'server/lib/publicDocumentHtml';
import { buildSitemapXml, type SitemapEntry } from 'server/lib/sitemapXml';

async function fetchAppShell(): Promise<string> {
  const response = await fetch(new URL('/index.html', apiConfig.frontendOrigin), {
    signal: AbortSignal.timeout(5_000), redirect: 'error',
  });
  if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html')) {
    throw new Error('Public document shell unavailable');
  }
  const shell = await response.text();
  if (!shell.includes('id="root"') || !shell.includes('</head>')) throw new Error('Invalid public document shell');
  return shell;
}

function canonicalUrl(path: string): string {
  return publicCanonical(path);
}

async function renderDocument(document: PublicDocument): Promise<string> {
  const shell = injectHead(await fetchAppShell(), {
    ...document, canonicalUrl: canonicalUrl(document.path),
  });
  // Existing map/gallery drawers keep their approved UI. Supplemental SEO
  // bodies must not flash on startup or disappear when React takes over.
  if (document.path === '/') return injectInitialBody(shell, firstVisitHtml());
  return ['/buy-surf-photos', '/sell-surf-photos'].includes(document.path)
    ? injectPublicDocument(shell, document)
    : shell;
}

const SITEMAP_SESSION_PAGE_SIZE = 200;

async function collectSitemapEntries(): Promise<SitemapEntry[]> {
  const entries: SitemapEntry[] = [
    { loc: canonicalUrl('/') }, { loc: canonicalUrl('/about') }, { loc: canonicalUrl('/gallery') },
    { loc: canonicalUrl('/buy-surf-photos') }, { loc: canonicalUrl('/sell-surf-photos') },
  ];
  const seenSpotSlugs = new Set<string>();
  let cursor: string | undefined;
  let hasMore = true;
  const seenCursors = new Set<string>();
  while (hasMore) {
    const page = await surfSessionRepository.listPublished({ cursor, limit: SITEMAP_SESSION_PAGE_SIZE });
    for (const session of page.items) {
      if (!(session.mediaCount > 0) || !isPublicSpotSlug(session.spot.slug)) continue;
      entries.push({ loc: canonicalUrl(`/${session.spot.slug}/session/${session.id}`) });
      if (!seenSpotSlugs.has(session.spot.slug)) {
        seenSpotSlugs.add(session.spot.slug);
        entries.push({ loc: canonicalUrl(`/${session.spot.slug}`) });
        entries.push({ loc: canonicalUrl(`/${session.spot.slug}/gallery`) });
      }
    }
    if (page.nextCursor && seenCursors.has(page.nextCursor)) throw new Error('Repeated discovery cursor');
    if (page.nextCursor) seenCursors.add(page.nextCursor);
    cursor = page.nextCursor ?? undefined;
    hasMore = page.nextCursor !== null;
  }
  return [...new Map(entries.map((entry) => [entry.loc, entry])).values()].sort((a, b) => a.loc.localeCompare(b.loc));
}

/** Same document for people and crawlers. The API origin itself remains disallowed. */
export const publicPagesRouter = new Hono();
publicPagesRouter.onError((_error, c) => c.text('Public page temporarily unavailable', 503, {
  'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store',
}));
publicPagesRouter.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  const path = c.req.path;
  if ((c.req.method === 'GET' || c.req.method === 'HEAD') && path !== '/' && path.endsWith('/')) {
    const target = path.replace(/\/+$/, '');
    const segments = target.split('/').filter(Boolean);
    if (['/about', '/gallery', '/buy-surf-photos', '/sell-surf-photos'].includes(target)
      || (segments[0] && isPublicSpotSlug(segments[0]) && (segments.length === 1 || segments[1] === 'gallery' || segments[1] === 'session'))) {
      return c.redirect(canonicalUrl(target), 308);
    }
  }
  await next();
  if (c.res.status >= 400) c.header('X-Robots-Tag', 'noindex');
  return undefined;
});
publicPagesRouter.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));
publicPagesRouter.get('/sitemap.xml', async (c) => c.body(buildSitemapXml(await collectSitemapEntries()), 200, { 'Content-Type': 'application/xml; charset=UTF-8' }));

const staticPages: Array<{ path: string; page: StaticPublicPage }> = [
  { path: '/', page: 'home' }, { path: '/about', page: 'about' },
  { path: '/gallery', page: 'gallery' }, { path: '/buy-surf-photos', page: 'buyer' },
  { path: '/sell-surf-photos', page: 'seller' },
];
for (const { path, page } of staticPages) {
  publicPagesRouter.get(path, async (c) => {
    const document = staticPublicDocument(page);
    return c.html(await renderDocument(document));
  });
}

publicPagesRouter.get('/:spotId', async (c) => {
  const slug = c.req.param('spotId');
  if (!isPublicSpotSlug(slug)) return c.notFound();
  const spot = await spotRepository.findSpotBySlug(slug);
  if (!spot) return c.notFound();
  const sessions = await surfSessionRepository.listPublished({ spotId: spot.id, limit: 20 });
  const document = spotPublicDocument(spot, false, sessions.items);
  if (document.noindex) c.header('X-Robots-Tag', 'noindex, follow');
  return c.html(await renderDocument(document));
});
publicPagesRouter.get('/:spotId/gallery', async (c) => {
  const slug = c.req.param('spotId');
  if (!isPublicSpotSlug(slug)) return c.notFound();
  const spot = await spotRepository.findSpotBySlug(slug);
  if (!spot) return c.notFound();
  const sessions = await surfSessionRepository.listPublished({ spotId: spot.id, limit: 20 });
  const document = spotPublicDocument(spot, true, sessions.items);
  if (document.noindex) c.header('X-Robots-Tag', 'noindex, follow');
  return c.html(await renderDocument(document));
});
publicPagesRouter.get('/:spotId/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  if (!z.uuid().safeParse(sessionId).success) return c.notFound();
  const session = await surfSessionRepository.findPublishedById(sessionId);
  if (!session || !isPublicSpotSlug(session.spot.slug)) return c.notFound();
  if (c.req.param('spotId') !== session.spot.slug) {
    return c.redirect(canonicalUrl(`/${session.spot.slug}/session/${sessionId}`), 308);
  }
  const document = sessionPublicDocument(session);
  if (document.noindex) c.header('X-Robots-Tag', 'noindex, follow');
  return c.html(await renderDocument(document));
});
