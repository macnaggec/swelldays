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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(SHELL_HTML, { status: 200 })));
    mocks.findSpotBySlug.mockReset();
    mocks.listPublished.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    mocks.findPublishedById.mockReset();
  });

  it('serves the home page shell with home copy and a canonical link', async () => {
    const res = await publicPagesRouter.request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<title>Swelldays | Buy and Sell Surf Photos &amp; Videos</title>');
    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/" />');
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
      items: [{ thumbnailUrl: 'https://res.cloudinary.com/demo/pipeline.jpg' }],
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
    expect(mocks.listPublished).toHaveBeenCalledWith({ spotId: 'spot-1', limit: 1 });
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
      id: 'session-1',
      spotId: 'spot-1',
      spot: { id: 'spot-1', slug: 'pipeline', name: 'Pipeline', location: 'Oahu, Hawaii' },
      startsAt: new Date('2026-04-01T15:00:00Z'),
      endsAt: new Date('2026-04-01T17:00:00Z'),
      thumbnailUrl: 'https://res.cloudinary.com/demo/session-1.jpg',
      mediaCount: 4,
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

  describe('/sitemap.xml', () => {
    it('includes the three static pages even with no published sessions', async () => {
      const res = await publicPagesRouter.request('/sitemap.xml');
      const xml = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/xml');
      expect(xml).toContain('<loc>https://swelldays.surf/</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/about</loc>');
      expect(xml).toContain('<loc>https://swelldays.surf/gallery</loc>');
      expect(xml.match(/<url>/g)).toHaveLength(3);
    });

    it('adds a spot page, spot gallery, and session URL per published session, deduping the spot by slug across multiple sessions', async () => {
      mocks.listPublished.mockResolvedValue({
        items: [
          {
            id: 'session-1',
            spot: { slug: 'pipeline' },
            createdAt: new Date('2026-04-02T00:00:00.000Z'),
          },
          {
            id: 'session-2',
            spot: { slug: 'pipeline' },
            createdAt: new Date('2026-04-01T00:00:00.000Z'),
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
      expect(xml.match(/<url>/g)).toHaveLength(7);
      expect(xml).toContain('<loc>https://swelldays.surf/pipeline</loc>\n    <lastmod>2026-04-02T00:00:00.000Z</lastmod>');
    });

    it('walks every page of published sessions via the cursor until nextCursor is null', async () => {
      mocks.listPublished
        .mockResolvedValueOnce({
          items: [{ id: 'session-1', spot: { slug: 'pipeline' }, createdAt: new Date('2026-04-02T00:00:00.000Z') }],
          nextCursor: 'session-1',
        })
        .mockResolvedValueOnce({
          items: [{ id: 'session-2', spot: { slug: 'uluwatu' }, createdAt: new Date('2026-04-01T00:00:00.000Z') }],
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
