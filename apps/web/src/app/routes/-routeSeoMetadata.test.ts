import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the Phase 1/2 SEO work in docs/roadmaps/seo-optimization.md: every
 * route that owns a page's title/description/canonical/robots tags must wire
 * up through shared/lib/seoMeta, so a new route can't silently ship with the
 * generic index.html defaults (public) or without noindex (private).
 *
 * This checks that the wiring exists, not the exact title/description
 * copy — the latter is covered by each route's own tests. A route file not
 * accounted for in ROUTES_INHERITING_HEAD_FROM_PARENT below must import from
 * seoMeta itself; add newly-created layout-only routes to that list only
 * when they genuinely have no page identity of their own and fully inherit
 * from an ancestor that does.
 */

const routesDir = path.join(process.cwd(), 'apps/web/src/app/routes');

// Pathless layouts and pages that intentionally have no head() of their own
// because a parent route already sets it (title/description cascade down;
// noindex meta cascades the same way) — see seoMeta.ts's module comment.
const ROUTES_INHERITING_HEAD_FROM_PARENT = new Set([
  '__root.tsx', // renders <HeadContent /> but owns no page copy itself
  '_panel.tsx', // shared panel shell; every child sets its own head
  '_page.admin.tsx', // inherits noindex from _page.tsx
  '_page.order-success.tsx', // inherits noindex from _page.tsx
  '_panel.me.collections.tsx', // inherits noindex from _panel.me.tsx
  '_panel.me.collections.index.tsx',
  '_panel.me.collections.favorites.tsx',
  '_panel.me.collections.purchases.tsx',
  '_panel.me.earnings.tsx',
  '_panel.me.index.tsx',
]);

function isRealRouteFile(fileName: string): boolean {
  return fileName.endsWith('.tsx') && !fileName.startsWith('-');
}

function importsSeoMeta(fileName: string): boolean {
  const contents = readFileSync(path.join(routesDir, fileName), 'utf8');
  return contents.includes("shared/lib/seoMeta'");
}

describe('route SEO metadata wiring', () => {
  const routeFiles = readdirSync(routesDir).filter(isRealRouteFile);

  it('found the route files this check is meant to cover', () => {
    // A regression here means the directory listing itself broke, not a
    // missing route — sanity-checks the test isn't silently scanning nothing.
    expect(routeFiles.length).toBeGreaterThan(15);
  });

  it('every exempted route file still exists on disk', () => {
    const missing = [...ROUTES_INHERITING_HEAD_FROM_PARENT].filter((file) => !routeFiles.includes(file));
    expect(missing).toEqual([]);
  });

  it.each(routeFiles.filter((file) => !ROUTES_INHERITING_HEAD_FROM_PARENT.has(file)))(
    '%s imports shared/lib/seoMeta',
    (file) => {
      expect(importsSeoMeta(file)).toBe(true);
    },
  );
});
