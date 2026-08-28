import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { formatWebDeliveryReport, verifyWebDelivery } from './webDeliveryVerifier';

type DeliveryScenario =
  | 'valid'
  | 'missing-html-gzip'
  | 'missing-gzip'
  | 'duplicate-cache-control'
  | 'non-immutable-cache-control'
  | 'wrong-release'
  | 'encoded-icon'
  | 'broken-spa-fallback'
  | 'unresolved-vite-marker'
  | 'unresolved-runtime-marker';

const release = 'test-release';
const javascriptPath = '/assets/index-Ab12cd34.js';
const stylesheetPath = '/assets/index-Ef56gh78.css';
const manifestPath = '/site.webmanifest';
const iconPath = '/favicon-32x32.png';

const javascriptBody = Buffer.from('const delivery = "verified";\n'.repeat(256));
const stylesheetBody = Buffer.from('.delivery{display:block;color:navy}\n'.repeat(128));
const manifestBody = Buffer.from('{"name":"Swelldays","icons":[]}\n');
const iconBody = Buffer.from('small-real-icon-fixture');

const activeServers: Server[] = [];

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map((server) => (
    new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })
  )));
});

const createIndexBody = (scenario: DeliveryScenario): Buffer => {
  const marker = scenario === 'unresolved-vite-marker'
    ? '<meta name="bad" content="%VITE_API_URL%">'
    : scenario === 'unresolved-runtime-marker'
      ? '<script>window.config = __SWELLDAYS_WEB_CONFIG__;</script>'
      : '';

  return Buffer.from(`<!doctype html>
<html>
  <head>
    <link rel="manifest" href="${manifestPath}">
    <link rel="icon" type="image/png" href="${iconPath}">
    <link rel="stylesheet" href="${stylesheetPath}">
    ${marker}
  </head>
  <body><script type="module" src="${javascriptPath}"></script></body>
</html>\n`);
};

const acceptsGzip = (value: string | undefined): boolean => (
  value?.split(',').some((encoding) => encoding.trim().startsWith('gzip')) ?? false
);

const createDeliveryServer = async (
  scenario: DeliveryScenario = 'valid',
): Promise<string> => {
  const indexBody = createIndexBody(scenario);
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://fixture.test').pathname;
    const gzipAccepted = acceptsGzip(request.headers['accept-encoding']);

    if (requestPath === '/healthz') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('ok\n');
      return;
    }

    if (requestPath === '/release.txt') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain',
      });
      response.end(scenario === 'wrong-release' ? 'other-release\n' : `${release}\n`);
      return;
    }

    if (requestPath === '/index.html') {
      const shouldGzip = gzipAccepted && scenario !== 'missing-html-gzip';
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Vary', 'Accept-Encoding');
      if (shouldGzip) response.setHeader('Content-Encoding', 'gzip');
      response.writeHead(200);
      response.end(shouldGzip ? gzipSync(indexBody) : indexBody);
      return;
    }

    if (requestPath === '/__delivery_verifier__/nested/route') {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      response.end(scenario === 'broken-spa-fallback'
        ? Buffer.from('<!doctype html><p>wrong fallback</p>\n')
        : indexBody);
      return;
    }

    const hashedAsset = requestPath === javascriptPath
      ? { body: javascriptBody, contentType: 'text/javascript' }
      : requestPath === stylesheetPath
        ? { body: stylesheetBody, contentType: 'text/css' }
        : undefined;

    if (hashedAsset !== undefined) {
      const cacheControl = scenario === 'non-immutable-cache-control'
        ? 'public, max-age=31536000'
        : 'public, max-age=31536000, immutable';
      const cacheControlHeader = scenario === 'duplicate-cache-control'
        ? [cacheControl, cacheControl]
        : cacheControl;
      const shouldGzip = gzipAccepted && scenario !== 'missing-gzip';
      response.setHeader('Cache-Control', cacheControlHeader);
      response.setHeader('Content-Type', hashedAsset.contentType);
      response.setHeader('Vary', 'Accept-Encoding');
      if (shouldGzip) response.setHeader('Content-Encoding', 'gzip');
      response.writeHead(200);
      response.end(shouldGzip ? gzipSync(hashedAsset.body) : hashedAsset.body);
      return;
    }

    if (requestPath === manifestPath || requestPath === iconPath) {
      const isIcon = requestPath === iconPath;
      const shouldGzip = isIcon && gzipAccepted && scenario === 'encoded-icon';
      const body = isIcon ? iconBody : manifestBody;
      response.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      response.setHeader('Content-Type', isIcon ? 'image/png' : 'application/manifest+json');
      if (shouldGzip) response.setHeader('Content-Encoding', 'gzip');
      response.writeHead(200);
      response.end(shouldGzip ? gzipSync(body) : body);
      return;
    }

    response.writeHead(404);
    response.end('not found\n');
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  activeServers.push(server);

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected the delivery fixture server to listen on a TCP port');
  }
  return `http://127.0.0.1:${address.port}`;
};

const verifyFixture = async (scenario: DeliveryScenario = 'valid') => {
  const origin = await createDeliveryServer(scenario);
  return verifyWebDelivery({ origin, expectedRelease: release });
};

describe('verifyWebDelivery', () => {
  it('accepts a valid web delivery and reports its measured assets', async () => {
    const report = await verifyFixture();

    expect(report.release).toBe(release);
    expect(report.hashedAssets.map(({ kind, path }) => ({ kind, path }))).toEqual([
      { kind: 'javascript', path: javascriptPath },
      { kind: 'stylesheet', path: stylesheetPath },
    ]);
    expect(report.hashedAssets.every((asset) => asset.gzipBytes < asset.identityBytes)).toBe(true);
    expect(report.stableAssets).toEqual([manifestPath, iconPath]);
    expect(report.spaFallbackPath).toBe('/__delivery_verifier__/nested/route');
    expect(formatWebDeliveryReport(report)).toContain('javascript: identity=');
    expect(formatWebDeliveryReport(report)).toContain('stylesheet: identity=');
    expect(formatWebDeliveryReport(report)).not.toContain('index-Ab12cd34.js');
  });

  it('rejects a hashed asset that is not served with gzip', async () => {
    await expect(verifyFixture('missing-gzip')).rejects.toThrow(javascriptPath);
  });

  it('rejects entry HTML that is not served with gzip', async () => {
    await expect(verifyFixture('missing-html-gzip')).rejects.toThrow(/index\.html.*gzip/i);
  });

  it('rejects duplicate Cache-Control headers on a hashed asset', async () => {
    await expect(verifyFixture('duplicate-cache-control')).rejects.toThrow(/Cache-Control/i);
  });

  it('rejects a non-immutable Cache-Control policy on a hashed asset', async () => {
    await expect(verifyFixture('non-immutable-cache-control')).rejects.toThrow(/immutable/i);
  });

  it('rejects a release identity that does not match the expected release', async () => {
    await expect(verifyFixture('wrong-release')).rejects.toThrow(/test-release/);
  });

  it('rejects an encoded image icon', async () => {
    await expect(verifyFixture('encoded-icon')).rejects.toThrow(iconPath);
  });

  it('rejects a SPA fallback whose body differs from the entry HTML', async () => {
    await expect(verifyFixture('broken-spa-fallback')).rejects.toThrow(/SPA fallback/i);
  });

  it('rejects an unresolved Vite environment marker in entry HTML', async () => {
    await expect(verifyFixture('unresolved-vite-marker')).rejects.toThrow(/%VITE_API_URL%/);
  });

  it('rejects an unresolved runtime configuration marker in entry HTML', async () => {
    await expect(verifyFixture('unresolved-runtime-marker')).rejects.toThrow(
      /__SWELLDAYS_WEB_CONFIG__/,
    );
  });
});
