import { describe, expect, it } from 'vitest';
import { buildSitemapXml } from './sitemapXml';

describe('buildSitemapXml', () => {
  it('renders one <url> per entry with an XML declaration and urlset wrapper', () => {
    const xml = buildSitemapXml([
      { loc: 'https://swelldays.surf/' },
      { loc: 'https://swelldays.surf/about' },
    ]);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://swelldays.surf/</loc>');
    expect(xml).toContain('<loc>https://swelldays.surf/about</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('includes <lastmod> only for entries that provide one', () => {
    const xml = buildSitemapXml([
      { loc: 'https://swelldays.surf/gallery' },
      { loc: 'https://swelldays.surf/spot-1', lastmod: new Date('2026-04-01T12:00:00.000Z') },
    ]);

    expect(xml).toContain('<lastmod>2026-04-01T12:00:00.000Z</lastmod>');
    const galleryBlock = xml.split('<url>')[1];
    expect(galleryBlock).not.toContain('<lastmod>');
  });

  it('escapes XML-significant characters in the URL', () => {
    const xml = buildSitemapXml([{ loc: 'https://swelldays.surf/spot?a=1&b=2' }]);

    expect(xml).toContain('<loc>https://swelldays.surf/spot?a=1&amp;b=2</loc>');
    expect(xml).not.toContain('a=1&b=2');
  });
});
