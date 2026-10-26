import {
  DEFAULT_SOCIAL_IMAGE, PUBLIC_ORIGIN, publicCanonical, serializePublicJsonLd,
  type PublicDocument,
} from '@swelldays/contracts/core';

type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };
type LinkTag = { rel: string; href: string };

export function buildPageMeta(input: { title: string; description: string; imageUrl?: string; noindex?: boolean }): MetaTag[] {
  const image = new URL(input.imageUrl ?? DEFAULT_SOCIAL_IMAGE, PUBLIC_ORIGIN).toString();
  return [
    { title: input.title },
    { name: 'description', content: input.description },
    { name: 'robots', content: input.noindex ? 'noindex, follow' : 'index, follow' },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
    { property: 'og:image', content: image },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:title', content: input.title },
    { name: 'twitter:description', content: input.description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
  ];
}

export function buildCanonicalLink(path: string): LinkTag[] {
  return [{ rel: 'canonical', href: publicCanonical(path) }];
}

export function buildPublicDocumentHead(document: PublicDocument) {
  return {
    meta: [...buildPageMeta(document), { property: 'og:url', content: publicCanonical(document.path) }],
    links: buildCanonicalLink(document.path),
    scripts: document.jsonLd.map((value) => ({ type: 'application/ld+json', children: serializePublicJsonLd(value) })),
  };
}

/** Private pages replace social copy too, preventing a previous entity leaking through. */
export const NOINDEX_HEAD = {
  meta: [
    ...buildPageMeta({ title: 'Account & Checkout | Swelldays', description: 'Your Swelldays account and purchases.', noindex: true }),
    { name: 'robots', content: 'noindex, nofollow' },
  ] satisfies MetaTag[],
};

/** Called only after the router has loaded; React takes ownership on its first commit. */
export function releaseInitialSeoHead(): void {
  document.head.querySelectorAll('title, meta[name="description"], meta[name="robots"], meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[type="application/ld+json"]').forEach((node) => node.remove());
}
