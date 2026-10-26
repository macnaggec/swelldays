import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const nginx = readFileSync('apps/web/nginx.conf', 'utf8');
const robots = readFileSync('apps/web/public/robots.txt', 'utf8');
describe('web document ownership', () => {
  it('serves private documents from the web shell with visible noindex without redirecting into the shim', () => {
    expect(nginx).toContain('location ~ ^/(?:cart|checkout|upload|me|admin|auth|order-success)(?:/|$)');
    expect(nginx).toContain('add_header X-Robots-Tag "noindex, nofollow" always;');
    expect(nginx).toContain('try_files /index.html =503;');
  });
  it('allows private-shell crawling so crawlers can read noindex, without exposing it in the sitemap', () => {
    expect(robots).not.toMatch(/^Disallow: \/(?:cart|checkout|upload|me|admin|auth|order-success)/m);
    expect(robots).toContain('Sitemap: https://swelldays.surf/sitemap.xml');
  });
  it('keeps index.html and static assets out of application document routing', () => {
    expect(nginx).toContain('location = /index.html');
    expect(nginx).toContain('location /assets/');
    expect(nginx).toContain('try_files $uri =404;');
  });
});
