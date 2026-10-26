import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta name="description" content="Default description" />
  <meta property="og:title" content="Default title" />
  <meta property="og:description" content="Default og description" />
  <meta property="og:image" content="/default-image.png" />
  <meta name="twitter:title" content="Default title" />
  <meta name="twitter:description" content="Default og description" />
  <meta name="twitter:image" content="/default-image.png" />
  <title>Default title</title>
</head>
<body><div id="root"></div></body>
</html>
`;

const mocks = vi.hoisted(() => ({
  findSpotBySlug: vi.fn(),
  listPublished: vi.fn(),
  findPublishedById: vi.fn(),
}));

vi.mock('server/config/env', () => ({
  apiConfig: { frontendOrigin: 'https://swelldays.surf' },
}));

vi.mock('server/repositories/SpotRepository', () => ({
  spotRepository: { findSpotBySlug: mocks.findSpotBySlug },
}));

vi.mock('server/repositories/SurfSessionRepository', () => ({
  surfSessionRepository: {
    listPublished: mocks.listPublished,
    findPublishedById: mocks.findPublishedById,
  },
}));

import { publicPagesRouter } from './publicPages';

describe('publicPagesRouter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(SHELL_HTML, { status: 200, headers: { 'Content-Type': 'text/html' } })));
    mocks.findSpotBySlug.mockReset();
    mocks.listPublished.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    mocks.findPublishedById.mockReset();
  });

  it('serves a disallow-all robots.txt, since this origin is a metadata mirror, not a page meant to be indexed', async () => {
    const res = await publicPagesRouter.request('/robots.txt');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toBe('User-agent: *\nDisallow: /\n');
  });

  it('serves the home page shell with home copy and a canonical link', async () => {
    const res = await publicPagesRouter.request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Buy and Sell Surf Photos &amp; Videos | Swelldays</title>');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/" />');
  });

  it('preserves the existing loading shell beside the initial welcome for early returning-visit selection', async () => {
    const shell = readFileSync('apps/web/index.html', 'utf8');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(shell, { headers: { 'Content-Type': 'text/html' } })));
    const response = await publicPagesRouter.request('/');
    const html = await response.text();

    expect(html).toContain('<div data-first-visit-loader aria-hidden="true">');
    expect(html).toContain('<div data-bootstrap-shell');
    expect(html).toContain('<div data-first-visit-initial data-first-visit-preserved>');
    expect(html).toContain('data-first-visit-description');
    expect(html.match(/data-first-visit-action/g)).toHaveLength(2);
    expect(html.match(/id="root"/g)).toHaveLength(1);
  });

  it('serves the about page with about copy', async () => {
    const res = await publicPagesRouter.request('/about');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>About | Swelldays</title>');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/about" />');
  });

  it('serves the general gallery page with gallery copy', async () => {
    const res = await publicPagesRouter.request('/gallery');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Surf Photo &amp; Video Gallery | Swelldays</title>');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/gallery" />');
  });

  it('renders a spot page by slug with the spot title, Place JSON-LD, and the latest session thumbnail as og:image', async () => {
    mocks.findSpotBySlug.mockResolvedValue({
      id: 'spot-1',
      slug: 'pipeline',
      name: 'Pipeline',
      location: 'Oahu, Hawaii',
      coords: { lat: 21.6649, lng: -158.0525 },
    });
    mocks.listPublished.mockResolvedValue({
      items: [{ id: 'session-1', startsAt: new Date('2026-04-01T00:00:00Z'), mediaCount: 1, spot: { slug: 'pipeline', name: 'Pipeline' }, thumbnailUrl: 'https://res.cloudinary.com/demo/pipeline.jpg' }],
      nextCursor: null,
    });

    const res = await publicPagesRouter.request('/pipeline');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Pipeline Surf Photos &amp; Videos — Oahu, Hawaii | Swelldays</title>');
    expect(html).toContain('<meta property="og:image" content="https://res.cloudinary.com/demo/pipeline.jpg" />');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/pipeline" />');
    expect(html).toContain('"@type":"Place"');
    expect(mocks.findSpotBySlug).toHaveBeenCalledWith('pipeline');
    expect(mocks.listPublished).toHaveBeenCalledWith({ spotId: 'spot-1', limit: 20 });
  });

  it('returns 404 for a spot page when no spot has that slug', async () => {
    mocks.findSpotBySlug.mockResolvedValue(null);

    const res = await publicPagesRouter.request('/does-not-exist');

    expect(res.status).toBe(404);
  });

  it('renders a spot gallery page with a BreadcrumbList in addition to Place', async () => {
    mocks.findSpotBySlug.mockResolvedValue({
      id: 'spot-1',
      slug: 'pipeline',
      name: 'Pipeline',
      location: 'Oahu, Hawaii',
      coords: { lat: 21.6649, lng: -158.0525 },
    });

    const res = await publicPagesRouter.request('/pipeline/gallery');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Pipeline Photo &amp; Video Gallery — Oahu, Hawaii | Swelldays</title>');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/pipeline/gallery" />');
    const jsonLdCount = (html.match(/application\/ld\+json/g) ?? []).length;
    expect(jsonLdCount).toBe(2);
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"item":"https://swelldays.surf/pipeline"');
  });

  it('renders a session page with the spot name, formatted date, and session thumbnail', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      spotId: 'spot-1',
      spot: { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Oahu, Hawaii' },
      startsAt: new Date('2026-04-01T15:00:00Z'),
      endsAt: new Date('2026-04-01T17:00:00Z'),
      thumbnailUrl: 'https://res.cloudinary.com/demo/session-1.jpg',
      mediaCount: 4,
      photographer: { name: 'Kai' },
    });

    const res = await publicPagesRouter.request('/pipeline/session/11111111-1111-4111-8111-111111111111');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Pipeline Surf Session');
    expect(html).toContain('<meta property="og:image" content="https://res.cloudinary.com/demo/session-1.jpg" />');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/pipeline/session/11111111-1111-4111-8111-111111111111" />');
    expect(html).toContain('"item":"https://swelldays.surf/pipeline"');
  });

  it('returns 404 for a session page when the session does not exist', async () => {
    mocks.findPublishedById.mockResolvedValue(null);

    const res = await publicPagesRouter.request('/pipeline/session/11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed session id without querying the repository', async () => {
    const res = await publicPagesRouter.request('/pipeline/session/not-a-uuid');

    expect(res.status).toBe(404);
    expect(mocks.findPublishedById).not.toHaveBeenCalled();
  });

  it('permanently redirects a real session under the wrong spot to its actual URL', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      spot: { slug: 'pipeline' },
    });
    const res = await publicPagesRouter.request('/balangan/session/11111111-1111-4111-8111-111111111111?utm_source=test');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://swelldays.surf/pipeline/session/11111111-1111-4111-8111-111111111111');
  });

  it.each(['/cart', '/upload', '/auth', '/me', '/admin', '/checkout', '/assets', '/index.html', '/release.txt', '/favicon.ico', '/api'])('does not resolve reserved web/API path %s as a spot', async (path) => {
    const res = await publicPagesRouter.request(path);
    expect(res.status).toBe(404);
    expect(mocks.findSpotBySlug).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed with 503, noindex and no-store when the web shell is unavailable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('upstream unavailable'));
    const res = await publicPagesRouter.request('/');
    expect(res.status).toBe(503);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('bounds shell fetching, targets index.html directly, and rejects non-HTML shells', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('upstream error', { headers: { 'Content-Type': 'text/plain' } }));
    const res = await publicPagesRouter.request('/');
    expect(res.status).toBe(503);
    expect(fetch).toHaveBeenCalledWith(new URL('https://swelldays.surf/index.html'), expect.objectContaining({ signal: expect.any(AbortSignal), redirect: 'error' }));
  });

  it('marks missing entities noindex and supports HEAD without a body', async () => {
    mocks.findSpotBySlug.mockResolvedValue(null);
    const missing = await publicPagesRouter.request('/missing');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('X-Robots-Tag')).toBe('noindex');
    const head = await publicPagesRouter.request('/', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it.each(['/', '/gallery', '/about'])('preserves the approved app shell on %s without supplemental visible SEO blocks', async (path) => {
    const response = await publicPagesRouter.request(path);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('<link rel="canonical"');
    expect(html).not.toContain('<article class="public-document">');
    expect(html).not.toContain('Explore Swelldays');
    expect(mocks.listPublished).not.toHaveBeenCalled();
  });

  it.each([
    ['/buy-surf-photos', 'Find Your Surf Photos &amp; Videos', '/gallery'],
    ['/sell-surf-photos', 'Sell Your Surf Photos &amp; Videos', '/upload'],
  ])('serves only the actual commercial content/action on %s', async (path, heading, action) => {
    const res = await publicPagesRouter.request(path);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<h1>${heading}</h1>`);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(`href="${action}"`);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('Explore Swelldays');
    expect(mocks.listPublished).not.toHaveBeenCalled();
  });

  it('normalizes trailing slashes on public documents', async () => {
    const res = await publicPagesRouter.request('/about/?utm_source=test');
    expect(res.status).toBe(308);
    expect(res.headers.get('Location')).toBe('https://swelldays.surf/about');
  });

  it('does not index an empty published session', async () => {
    mocks.findPublishedById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      spot: { slug: 'pipeline', name: 'Pipeline', location: 'Hawaii' },
      startsAt: new Date('2026-01-01T00:00:00Z'), endsAt: new Date('2026-01-01T01:00:00Z'),
      mediaCount: 0, photographer: { name: 'Kai' },
    });
    const response = await publicPagesRouter.request('/pipeline/session/11111111-1111-4111-8111-111111111111');
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow');
    const html = await response.text();
    expect(html).toContain('content="noindex, follow"');
    expect(html).not.toContain('<article class="public-document">');
  });

  it('omits untrustworthy lastmod and empty/reserved inventory from sitemap', async () => {
    mocks.listPublished.mockResolvedValue({ items: [
      { id: 'one', spot: { slug: 'pipeline' }, mediaCount: 1, createdAt: new Date('2099-01-01') },
      { id: 'empty', spot: { slug: 'pipeline' }, mediaCount: 0 },
      { id: 'collision', spot: { slug: 'about' }, mediaCount: 1 },
    ], nextCursor: null });
    const response = await publicPagesRouter.request('/sitemap.xml');
    const xml = await response.text();
    expect(xml).toContain('/pipeline/session/one');
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('/session/empty');
    expect(xml).not.toContain('/about/session/');
  });

  it('fails safely on a repeated sitemap cursor rather than looping forever', async () => {
    mocks.listPublished
      .mockResolvedValueOnce({ items: [], nextCursor: 'same' })
      .mockResolvedValueOnce({ items: [], nextCursor: 'same' })
      .mockRejectedValueOnce(new Error('pagination should have stopped'));
    const response = await publicPagesRouter.request('/sitemap.xml');
    expect(response.status).toBe(503);
    expect(mocks.listPublished).toHaveBeenCalledTimes(2);
  });

  describe('/sitemap.xml', () => {
    it('includes all five static pages even with no published sessions', async () => {
      const res = await publicPagesRouter.request('/sitemap.xml');
      const xml = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/xml');
      expect(xml).toContain('<loc>https://swelldays.surf/</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/about</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/gallery</loc>');
      expect(xml.match(/<url>/g)).toHaveLength(5);
    });

    it('adds a spot page, spot gallery, and session URL per published session, deduping the spot by slug across multiple sessions', async () => {
      mocks.listPublished.mockResolvedValue({
        items: [
          {
            id: 'session-1',
            spot: { slug: 'pipeline' },
            mediaCount: 1, createdAt: new Date('2026-04-02T00:00:00.000Z'),
          },
          {
            id: 'session-2',
            spot: { slug: 'pipeline' },
            mediaCount: 1, createdAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ],
        nextCursor: null,
      });

      const res = await publicPagesRouter.request('/sitemap.xml');
      const xml = await res.text();

      expect(xml).toContain('<loc>https://swelldays.surf/pipeline/session/session-1</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/pipeline/session/session-2</loc>');
      expect(xml.match(/<loc>https:\/\/swelldays\.surf\/pipeline<\/loc>/g)).toHaveLength(1);
      expect(xml.match(/<loc>https:\/\/swelldays\.surf\/pipeline\/gallery<\/loc>/g)).toHaveLength(1);
      // 3 static + 2 sessions + 1 spot page + 1 spot gallery (deduped to the first/newest session seen)
      expect(xml.match(/<url>/g)).toHaveLength(9);
      expect(xml).not.toContain('<lastmod>');
    });

    it('walks every page of published sessions via the cursor until nextCursor is null', async () => {
      mocks.listPublished
        .mockResolvedValueOnce({
          items: [{ id: 'session-1', spot: { slug: 'pipeline' }, mediaCount: 1, createdAt: new Date('2026-04-02T00:00:00.000Z') }],
          nextCursor: 'session-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 'session-2', spot: { slug: 'uluwatu' }, mediaCount: 1, createdAt: new Date('2026-04-01T00:00:00.000Z') }],
          nextCursor: null,
        });

      const res = await publicPagesRouter.request('/sitemap.xml');
      const xml = await res.text();

      expect(mocks.listPublished).toHaveBeenCalledTimes(2);
      expect(mocks.listPublished).toHaveBeenNthCalledWith(1, { cursor: undefined, limit: 200 });
      expect(mocks.listPublished).toHaveBeenNthCalledWith(2, { cursor: 'session-1', limit: 200 });
      expect(xml).toContain('<loc>https://swelldays.surf/pipeline/session/session-1</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/uluwatu/session/session-2</loc>');
    });
  });
});


describe('homepage presentation HTML', () => {
  it('includes all explanation text without JS, map, auth or inventory queries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(SHELL_HTML, { headers: { 'Content-Type': 'text/html' } })));
    mocks.listPublished.mockClear();
    const res = await publicPagesRouter.request('/');
    const html = await res.text();
    expect(html).toContain('<h1');
    expect(html).toContain('Surf photos &amp; videos');
    expect(html).toContain('For surfers');
    expect(html).toContain('Find my photos');
    expect(html).toContain('For photographers');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).not.toContain('Explore the map');
    expect(html).not.toContain('Buy · Sell · Share');
    expect(html).toContain('href="/upload"');
    expect(html).toContain('href="/#map"');
    expect(html).toContain('JavaScript');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(mocks.listPublished).not.toHaveBeenCalled();
  });
});
