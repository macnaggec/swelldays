import { describe, expect, it, vi } from 'vitest';
import { buildCanonicalLink, buildPageMeta, NOINDEX_HEAD } from './seoMeta';

describe('public/client metadata parity', () => {
  it('replaces social copy, robots and absolute default images together', () => {
    const meta = buildPageMeta({ title: 'Surf', description: 'Find a session' });
    expect(meta).toContainEqual({ name: 'twitter:title', content: 'Surf' });
    expect(meta).toContainEqual({ name: 'twitter:description', content: 'Find a session' });
    expect(meta).toContainEqual({ property: 'og:image', content: 'https://swelldays.surf/android-chrome-512x512.png' });
    expect(meta).toContainEqual({ name: 'twitter:image', content: 'https://swelldays.surf/android-chrome-512x512.png' });
    expect(meta).toContainEqual({ name: 'robots', content: 'index, follow' });
  });
  it('canonicalizes to the public HTTPS origin independently of mirror host', () => {
    expect(buildCanonicalLink('/gallery')).toEqual([{ rel: 'canonical', href: 'https://swelldays.surf/gallery' }]);
  });
  it('clears entity social metadata for private pages', () => {
    expect(NOINDEX_HEAD.meta).toContainEqual({ name: 'robots', content: 'noindex, nofollow' });
    expect(NOINDEX_HEAD.meta).toContainEqual({ property: 'og:image', content: 'https://swelldays.surf/android-chrome-512x512.png' });
  });
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { createMemoryHistory, createRootRoute, createRoute, createRouter, HeadContent, Outlet, RouterProvider } from '@tanstack/react-router';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { buildPublicDocumentHead, releaseInitialSeoHead } from './seoMeta';

it('public → private → public navigation replaces canonical, schema, robots and social metadata', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const host = document.createElement('div');
  document.body.append(host);
  document.head.innerHTML = '<meta name="google-site-verification" content="keep" /><meta name="robots" content="index" /><link rel="canonical" href="https://swelldays.surf/old" /><script type="application/ld+json">{"old":true}</script>';
  releaseInitialSeoHead();
  expect(document.head.querySelector('[name="google-site-verification"]')).not.toBeNull();
  const rootRoute = createRootRoute({ component: () => createElement('div', null, createElement(HeadContent), createElement(Outlet)) });
  const first = createRoute({ getParentRoute: () => rootRoute, path: '/', head: () => buildPublicDocumentHead(staticPublicDocument('home')) });
  const privateRoute = createRoute({ getParentRoute: () => rootRoute, path: '/cart', head: () => NOINDEX_HEAD });
  const second = createRoute({ getParentRoute: () => rootRoute, path: '/about', head: () => buildPublicDocumentHead(staticPublicDocument('about')) });
  const testRouter = createRouter({ routeTree: rootRoute.addChildren([first, privateRoute, second]), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await testRouter.load();
  const root = createRoot(host);
  try {
    await act(async () => { root.render(createElement(RouterProvider, { router: testRouter })); });
    expect(document.head.querySelectorAll('[rel="canonical"]')).toHaveLength(1);
    expect(host.querySelectorAll('[type="application/ld+json"]')).toHaveLength(1);
    await act(async () => { await testRouter.navigate({ to: '/cart' }); });
    expect(document.head.querySelectorAll('[rel="canonical"]')).toHaveLength(0);
    expect(host.querySelectorAll('[type="application/ld+json"]')).toHaveLength(0);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow');
    await act(async () => { await testRouter.navigate({ to: '/about' }); });
    expect(document.head.querySelectorAll('[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('[rel="canonical"]')?.getAttribute('href')).toBe('https://swelldays.surf/about');
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
    expect(document.head.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe('About | Swelldays');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  }
});
