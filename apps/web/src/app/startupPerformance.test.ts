import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readWorkspaceFile = (path: string) => readFileSync(path, 'utf8');
const routeDirectory = 'apps/web/src/app/routes';
const routeModuleFiles = readdirSync(routeDirectory)
  .filter((file) => file.endsWith('.tsx') && !file.startsWith('-'))
  .sort();

describe('startup performance contracts', () => {
  it('automatically code-splits route components', () => {
    const viteConfig = readWorkspaceFile('apps/web/vite.config.ts');

    expect(viteConfig).toContain('autoCodeSplitting: true');
  });

  it('keeps shared support imports outside lazily split route modules', () => {
    const routeModuleNames = new Set(routeModuleFiles.map((file) => file.replace(/\.tsx$/, '')));

    for (const file of routeModuleFiles) {
      const path = `${routeDirectory}/${file}`;
      const routeImports = Array.from(
        readWorkspaceFile(path).matchAll(/from\s+['"](\.\/[^'"]+)['"]/g),
        (match) => match[1],
      ).filter((specifier) => specifier && routeModuleNames.has(specifier.slice(2)));

      expect(routeImports, path).toEqual([]);
    }
  });

  it('exports only Route from lazily split route modules', () => {
    for (const file of routeModuleFiles) {
      const path = `${routeDirectory}/${file}`;
      const unsupportedExports = readWorkspaceFile(path)
        .split('\n')
        .filter((line) => line.startsWith('export ') && !line.startsWith('export const Route ='));

      expect(unsupportedExports, path).toEqual([]);
    }
  });

  it('renders the branded logo shell before React downloads', () => {
    const indexHtml = readWorkspaceFile('apps/web/index.html');
    const bootstrapShell = indexHtml.match(
      /<div[^>]*data-bootstrap-shell[^>]*>[\s\S]*?<\/div>/,
    )?.[0];

    expect(bootstrapShell).toBeDefined();
    expect(bootstrapShell).toContain('<img');
    expect(bootstrapShell).toContain('width="600"');
    expect(bootstrapShell).toContain('height="272"');
    expect(bootstrapShell).toContain('fetchpriority="high"');
    expect(bootstrapShell).not.toContain('<span>SWELLDAYS</span>');
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
