import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { staticPublicDocument } from '@swelldays/contracts/core';
import { PublicDocument } from './PublicDocument';

describe('shared public copy rendered in React', () => {
  it.each(['home', 'buyer', 'seller', 'gallery', 'about'] as const)('%s has one meaningful heading and working ordinary links', (page) => {
    const document = staticPublicDocument(page);
    const dom = new DOMParser().parseFromString(renderToStaticMarkup(<PublicDocument document={document} />), 'text/html');
    expect(dom.querySelectorAll('h1')).toHaveLength(1);
    expect(dom.querySelector('h1')?.textContent).toBe(document.heading);
    expect(dom.body.textContent).toContain(document.intro);
    for (const section of document.sections) expect(dom.body.textContent).toContain(section.text);
    for (const link of document.links) expect([...dom.querySelectorAll('a')].some((anchor) => anchor.getAttribute('href') === link.href)).toBe(true);
    expect(dom.body.textContent).not.toMatch(/keep 80%|majority of each sale|within several business days|theft.proof|instant download/i);
  });
  it('buyer links to discovery and seller links to the existing auth-aware upload route', () => {
    expect(staticPublicDocument('buyer').links[0]?.href).toBe('/gallery');
    expect(staticPublicDocument('seller').links[0]?.href).toBe('/upload');
  });
});
