/**
 * Route `head()` building blocks for TanStack Router's native document-head
 * management (see __root.tsx's `<HeadContent />`). Title/description/OG meta
 * and the canonical link are split into separate builders because only the
 * single actual leaf route for a URL may declare a canonical link — a parent
 * layout route's `links` and a child route's `links` are both kept, so two
 * canonical declarations for one page would emit two conflicting tags.
 */

type MetaTag = { title: string } | { name: string; content: string } | { property: string; content: string };
type LinkTag = { rel: string; href: string };

export function buildPageMeta(input: { title: string; description: string }): MetaTag[] {
  return [
    { title: input.title },
    { name: 'description', content: input.description },
    { property: 'og:title', content: input.title },
    { property: 'og:description', content: input.description },
  ];
}

export function buildCanonicalLink(path: string): LinkTag[] {
  return [{ rel: 'canonical', href: new URL(path, window.location.origin).toString() }];
}

/** Applied to private/transactional routes (cart, checkout, account, upload, admin, auth). */
export const NOINDEX_HEAD = {
  meta: [{ name: 'robots', content: 'noindex, nofollow' }] as MetaTag[],
};
