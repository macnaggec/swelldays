import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readWorkspaceFile = (path: string) => readFileSync(path, 'utf8');

describe('startup performance contracts', () => {
  it('automatically code-splits route components', () => {
    const viteConfig = readWorkspaceFile('apps/web/vite.config.ts');

    expect(viteConfig).toContain('autoCodeSplitting: true');
  });

  it('renders a branded shell before React downloads', () => {
    const indexHtml = readWorkspaceFile('apps/web/index.html');

    expect(indexHtml).toContain('data-bootstrap-shell');
  });

  it('loads Google APIs only from the Drive feature', () => {
    const indexHtml = readWorkspaceFile('apps/web/index.html');

    expect(indexHtml).not.toContain('https://apis.google.com/js/api.js');
    expect(indexHtml).not.toContain('https://accounts.google.com/gsi/client');
  });

  it('keeps the Cloudflare module beacon from delaying page lifecycle', () => {
    const indexHtml = readWorkspaceFile('apps/web/index.html');
    const beaconTag = indexHtml.match(/<script[^>]+cloudflareinsights\.com\/beacon\.min\.js[^>]*>/)?.[0];
    const appEntryTag = indexHtml.match(/<script[^>]+src=["']\/src\/app\/main\.tsx["'][^>]*>/)?.[0];

    expect(beaconTag).toBeUndefined();
    expect(indexHtml).toContain("window.addEventListener('load'");
    expect(indexHtml).toContain("document.createElement('script')");
    expect(indexHtml).toContain('cloudflareinsights.com/beacon.min.js');
    expect(appEntryTag).toBeDefined();
    expect(appEntryTag).toMatch(/type=["']module["']/);
    expect(appEntryTag).not.toMatch(/\sasync(?:\s|>)/);
  });

  it('loads Sentry after the first browser paint opportunity', () => {
    const mainModule = readWorkspaceFile('apps/web/src/app/main.tsx');

    expect(mainModule).not.toMatch(/from ['"]@sentry\/react['"]/);
    expect(mainModule).toContain("import('@sentry/react')");
    expect(mainModule).toContain('requestAnimationFrame');
    expect(mainModule).toContain('SENTRY_STARTUP_DELAY_MS');
    expect(mainModule).toContain('window.setTimeout(scheduleWhenIdle, SENTRY_STARTUP_DELAY_MS)');
  });

  it('does not expose the unused standalone LocationPicker from the map entry point', () => {
    const globeMapEntry = readWorkspaceFile('apps/web/src/widgets/GlobeMap/index.ts');

    expect(globeMapEntry).not.toContain('LocationPicker');
  });
});
