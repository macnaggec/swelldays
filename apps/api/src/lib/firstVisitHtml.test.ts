import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { injectFirstVisitHtml } from './firstVisitHtml';

const shell = readFileSync('apps/web/index.html', 'utf8');

describe('initial welcome placement', () => {
  it('places the welcome outside the React root before it can paint', () => {
    const html = injectFirstVisitHtml(shell);
    expect(html.indexOf('<div data-first-visit-initial')).toBeLessThan(html.indexOf('<div id="root">'));
    expect(html).toContain('<div data-first-visit-initial data-first-visit-preserved>');
    expect(html).toContain('<div id="root"><div data-first-visit-loader aria-hidden="true">');
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html.match(/data-first-visit-document/g)).toHaveLength(1);
    expect(html.match(/<div data-bootstrap-shell/g)).toHaveLength(1);
    expect(html).toContain('<noscript>');
  });

  it('raises the existing logo preload priority without duplicating its request hint', () => {
    const links = shell.match(/<link\b[^>]*>/g) ?? [];
    const logo = links.filter((link) => link.includes('swelldays-logo-white.png'));
    expect(logo).toHaveLength(1);
    expect(logo[0]).toContain('fetchpriority="high"');
  });
});
