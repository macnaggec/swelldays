export type SitemapEntry = { loc: string; lastmod?: Date };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((entry) => {
    const lastmod = entry.lastmod ? `\n    <lastmod>${entry.lastmod.toISOString()}</lastmod>` : '';
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
