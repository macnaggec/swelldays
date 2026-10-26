import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FIRST_VISIT_CONTENT } from '@swelldays/contracts/core';
import { FirstVisitDocument } from './FirstVisitDocument';

describe('first visit document', () => {
  it('offers exactly two audience paths with one action each', () => {
    const html = renderToStaticMarkup(<FirstVisitDocument />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
    expect(doc.querySelector('h1')?.textContent).toBe(FIRST_VISIT_CONTENT.hero.heading);
    expect(doc.querySelectorAll('[data-first-visit-path]')).toHaveLength(2);
    expect(doc.querySelectorAll('a')).toHaveLength(2);
    const surfer = doc.querySelector('[data-first-visit-path="surfer"]');
    const photographer = doc.querySelector('[data-first-visit-path="photographer"]');
    expect(surfer?.textContent).toContain('For surfers');
    expect(surfer?.querySelector('a')?.textContent).toBe('Find my photos');
    expect(surfer?.querySelector('a')?.getAttribute('href')).toBe('/#map');
    expect(photographer?.textContent).toContain('For photographers');
    expect(photographer?.querySelector('a')?.textContent).toBe('Start uploading');
    expect(photographer?.querySelector('a')?.getAttribute('href')).toBe('/upload');
    expect(doc.querySelectorAll('ol, [data-first-visit-map], [data-first-visit-skip]')).toHaveLength(0);
    expect(doc.body.textContent).not.toMatch(/Share|Earnings|Explore the map/);
    expect(html).not.toContain('public-document');
  });
});
