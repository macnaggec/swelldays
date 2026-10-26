import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { injectPublicDocument, publicDocumentHtml } from './publicDocumentHtml';
import { injectHead } from './htmlHead';

describe('semantic initial documents', () => {
  it.each(['home', 'buyer', 'seller', 'about', 'gallery'] as const)('%s uses shared visible copy inside the sole React root', (page) => {
    const document = staticPublicDocument(page);
    const shell = readFileSync('apps/web/index.html', 'utf8');
    const html = injectPublicDocument(shell, document);
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).not.toContain('<div data-bootstrap-shell');
    expect(html).toContain('src="/src/app/main.tsx"');
    for (const section of document.sections) expect(html).toContain(section.text);
    expect(html.indexOf('<article')).toBeGreaterThan(html.indexOf('id="root"'));
  });

  it('supports Vite production shells with the module script moved into head', () => {
    const html = injectPublicDocument('<head><script type="module" src="/assets/index-hash.js"></script></head><body><div id="root"><div data-bootstrap-shell><img src="/assets/logo.png" /></div></div><!-- analytics --><script>beacon()</script></body>', staticPublicDocument('home'));
    expect(html).toContain('<h1>Buy and Sell Surf Photos &amp; Videos</h1>');
    expect(html).toContain('/assets/index-hash.js');
    expect(html).toContain('beacon()');
    expect(html).not.toContain('<div data-bootstrap-shell');
  });

  it('escapes entity text, headings and attributes without injecting scripts', () => {
    const document = staticPublicDocument('home');
    document.heading = '</h1><script>alert("x")</script>';
    document.links = [{ href: '/safe?x=" onclick="bad', label: '<img onerror=bad>' }];
    const html = publicDocumentHtml(document);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&quot; onclick=&quot;');
  });

  it('retains Google/Bing verification and asset tags while replacing duplicate owned head tags', () => {
    const shell = '<head><meta name="google-site-verification" content="google-token" /><meta name="msvalidate.01" content="bing-token" /><link rel="icon" href="/favicon.ico" /><link rel="canonical" href="https://old.test/" /><script type="application/ld+json">{"old":true}</script></head>';
    const html = injectHead(injectHead(shell, { title: 'Old', description: 'Old', canonicalUrl: 'https://swelldays.surf/old' }), { title: 'New', description: 'New', canonicalUrl: 'https://swelldays.surf/new' });
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).not.toContain('old.test');
    expect(html).not.toContain('"old":true');
    expect(html).toContain('google-token');
    expect(html).toContain('bing-token');
    expect(html).toContain('/favicon.ico');
  });
});
