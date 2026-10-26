import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { Route as BuyerRoute } from './_panel.buy-surf-photos';
import { Route as SellerRoute } from './_panel.sell-surf-photos';

afterEach(() => vi.restoreAllMocks());
describe('commercial pages show their content and action only', () => {
  it('buyer has its actual gallery action without a navigation or session link dump', () => {
    vi.spyOn(BuyerRoute, 'useLoaderData').mockReturnValue(staticPublicDocument('buyer'));
    const View = BuyerRoute.options.component;
    if (typeof View !== 'function') throw new Error('Expected buyer view');
    const html = renderToStaticMarkup(<View />);
    expect(html).toContain('Find Your Surf Photos');
    expect(html).toContain('href="/gallery"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('/session/');
  });
  it('seller has its actual upload action without a navigation or session link dump', () => {
    vi.spyOn(SellerRoute, 'useLoaderData').mockReturnValue(staticPublicDocument('seller'));
    const View = SellerRoute.options.component;
    if (typeof View !== 'function') throw new Error('Expected seller view');
    const html = renderToStaticMarkup(<View />);
    expect(html).toContain('Sell Your Surf Photos');
    expect(html).toContain('href="/upload"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('/session/');
  });
});
