/** Public documents share the same path namespace as web assets and private UI. */
export const RESERVED_SPOT_SLUGS: readonly string[] = [
  'about', 'gallery', 'buy-surf-photos', 'sell-surf-photos',
  'cart', 'checkout', 'upload', 'me', 'admin', 'auth', 'order-success',
  'api', 'assets', 'healthz', 'index', 'robots', 'sitemap', 'release',
];

export function isPublicSpotSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !RESERVED_SPOT_SLUGS.includes(slug);
}
