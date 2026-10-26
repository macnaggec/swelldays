import { DEFAULT_SOCIAL_IMAGE, PUBLIC_ORIGIN } from '@swelldays/contracts/core';

/**
 * Swaps the per-page title/description/OG/Twitter tags into an already-built
 * index.html shell and appends a canonical link and optional JSON-LD blocks.
 * Matches by the tag's identifying attribute (not its current text), so this
 * keeps working if the copy in index.html or the route heads changes later.
 */

export type PageHeadInput = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl?: string;
  noindex?: boolean;
  jsonLd?: Record<string, unknown>[];
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

function replaceTag(html: string, pattern: RegExp, replacement: string): string {
  // A function replacer avoids String.replace's special $-pattern handling,
  // which would otherwise misfire if a spot/session name contains "$".
  return html.replace(pattern, () => replacement);
}

function jsonLdScriptTag(entry: Record<string, unknown>): string {
  const json = JSON.stringify(entry).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

export function injectHead(html: string, head: PageHeadInput): string {
  // Replace only owned SEO fields. Preserve verification tags, icons and assets.
  const clean = html
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const image = new URL(head.imageUrl ?? DEFAULT_SOCIAL_IMAGE, PUBLIC_ORIGIN).toString();
  const tags = [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeAttr(head.description)}" />`,
    `<meta name="robots" content="${head.noindex ? 'noindex, follow' : 'index, follow'}" />`,
    ...['og', 'twitter'].flatMap((prefix) => {
      const attr = prefix === 'og' ? 'property' : 'name';
      return [
        `<meta ${attr}="${prefix}:title" content="${escapeAttr(head.title)}" />`,
        `<meta ${attr}="${prefix}:description" content="${escapeAttr(head.description)}" />`,
        `<meta ${attr}="${prefix}:image" content="${escapeAttr(image)}" />`,
      ];
    }),
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${escapeAttr(head.canonicalUrl)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<link rel="canonical" href="${escapeAttr(head.canonicalUrl)}" />`,
    ...(head.jsonLd ?? []).map(jsonLdScriptTag),
  ].join('\n  ');
  return replaceTag(clean, /<\/head>/, `  ${tags}\n</head>`);
}
