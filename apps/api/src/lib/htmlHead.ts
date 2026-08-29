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
  let result = html;

  result = replaceTag(result, /<title>.*?<\/title>/s, `<title>${escapeHtml(head.title)}</title>`);
  result = replaceTag(result, /<meta name="description"[^>]*>/, `<meta name="description" content="${escapeAttr(head.description)}" />`);
  result = replaceTag(result, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttr(head.title)}" />`);
  result = replaceTag(result, /<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttr(head.description)}" />`);
  result = replaceTag(result, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeAttr(head.title)}" />`);
  result = replaceTag(result, /<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeAttr(head.description)}" />`);

  if (head.imageUrl) {
    result = replaceTag(result, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeAttr(head.imageUrl)}" />`);
    result = replaceTag(result, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeAttr(head.imageUrl)}" />`);
  }

  const appendedTags = [
    `<link rel="canonical" href="${escapeAttr(head.canonicalUrl)}" />`,
    ...(head.jsonLd ?? []).map(jsonLdScriptTag),
  ].join('\n  ');

  result = replaceTag(result, /<\/head>/, `  ${appendedTags}\n</head>`);

  return result;
}
