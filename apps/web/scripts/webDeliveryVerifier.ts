import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export type DeliveryAssetKind = 'javascript' | 'stylesheet';

export interface DeliveryAsset {
  kind: DeliveryAssetKind;
  path: string;
}

export interface VerifiedDeliveryAsset extends DeliveryAsset {
  identityBytes: number;
  gzipBytes: number;
  referenceGzipBytes: number;
  gzipDeltaBytes: number;
}

export interface VerifyWebDeliveryOptions {
  origin: string;
  expectedRelease: string;
  healthAttempts?: number;
  healthRetryDelayMs?: number;
  gzipSizeToleranceBytes?: number;
}

export interface WebDeliveryReport {
  origin: string;
  release: string;
  hashedAssets: VerifiedDeliveryAsset[];
  stableAssets: string[];
  spaFallbackPath: string;
}

interface DeliveryResponse {
  statusCode: number;
  headers: IncomingHttpHeaders;
  rawHeaders: string[];
  body: Buffer;
}

interface ParsedHtmlAssets {
  hashedAssets: DeliveryAsset[];
  stableAssets: string[];
}

interface CliOptions {
  origin?: string;
  expectedRelease?: string;
  healthAttempts?: number;
  healthRetryDelayMs?: number;
  gzipSizeToleranceBytes?: number;
}

const defaultHealthAttempts = 40;
const defaultHealthRetryDelayMs = 250;
const defaultGzipSizeToleranceBytes = 1_024;
const spaFallbackPath = '/__delivery_verifier__/nested/route';
const immutableCachePolicy = 'public, max-age=31536000, immutable';
const stableCachePolicy = 'public, max-age=300, must-revalidate';

const fail = (subject: string, message: string): never => {
  throw new Error(`${subject}: ${message}`);
};

const requireInteger = (
  value: number | undefined,
  fallback: number,
  label: string,
  minimum: number,
): number => {
  const resolvedValue = value ?? fallback;
  if (!Number.isInteger(resolvedValue) || resolvedValue < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }
  return resolvedValue;
};

const normalizeOrigin = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('origin must be an absolute HTTP(S) origin');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('origin must use HTTP or HTTPS');
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error('origin must not contain credentials');
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('origin must not contain a path, query, or fragment');
  }
  return new URL(url.origin);
};

const delay = async (milliseconds: number): Promise<void> => {
  if (milliseconds === 0) return;
  await new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
};

const get = async (
  origin: URL,
  path: string,
  acceptEncoding: 'identity' | 'gzip',
): Promise<DeliveryResponse> => {
  const url = new URL(path, origin);
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<DeliveryResponse>((resolveResponse, rejectResponse) => {
    const outgoingRequest = request(url, {
      headers: { 'Accept-Encoding': acceptEncoding },
      method: 'GET',
    }, (incomingResponse) => {
      const chunks: Buffer[] = [];
      incomingResponse.on('data', (chunk: Buffer | string) => {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      });
      incomingResponse.on('end', () => {
        resolveResponse({
          statusCode: incomingResponse.statusCode ?? 0,
          headers: incomingResponse.headers,
          rawHeaders: incomingResponse.rawHeaders,
          body: Buffer.concat(chunks),
        });
      });
      incomingResponse.on('aborted', () => {
        rejectResponse(new Error(`${path}: response was aborted`));
      });
      incomingResponse.on('error', rejectResponse);
    });
    outgoingRequest.setTimeout(15_000, () => {
      outgoingRequest.destroy(new Error(`${path}: request timed out`));
    });
    outgoingRequest.on('error', rejectResponse);
    outgoingRequest.end();
  });
};

const requireStatus = (response: DeliveryResponse, path: string): void => {
  if (response.statusCode !== 200) {
    fail(path, `expected status 200, received ${response.statusCode}`);
  }
};

const getHeaderValues = (response: DeliveryResponse, name: string): string[] => {
  const values: string[] = [];
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    if (response.rawHeaders[index]?.toLowerCase() === name.toLowerCase()) {
      values.push(response.rawHeaders[index + 1] ?? '');
    }
  }
  return values;
};

const requireOneHeader = (
  response: DeliveryResponse,
  name: string,
  path: string,
): string => {
  const values = getHeaderValues(response, name);
  if (values.length !== 1) {
    fail(path, `expected exactly one ${name} header, received ${values.length}`);
  }
  return values[0] ?? '';
};

const normalizeCacheControl = (value: string): string => (
  value.split(',').map((directive) => directive.trim().toLowerCase()).join(', ')
);

const requireCachePolicy = (
  response: DeliveryResponse,
  path: string,
  expectedPolicy: string,
): void => {
  const actualPolicy = normalizeCacheControl(requireOneHeader(response, 'Cache-Control', path));
  if (actualPolicy !== expectedPolicy) {
    fail(path, `expected Cache-Control "${expectedPolicy}", received "${actualPolicy}"`);
  }
};

const requireNoStore = (response: DeliveryResponse, path: string): void => {
  const cacheControl = normalizeCacheControl(requireOneHeader(response, 'Cache-Control', path));
  if (!cacheControl.split(', ').includes('no-store')) {
    fail(path, `expected Cache-Control to contain no-store, received "${cacheControl}"`);
  }
};

const requireContentType = (
  response: DeliveryResponse,
  path: string,
  expectedType: string,
): void => {
  const contentType = response.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== expectedType) {
    fail(path, `expected Content-Type ${expectedType}, received ${contentType ?? 'none'}`);
  }
};

const requireNoContentEncoding = (response: DeliveryResponse, path: string): void => {
  const encodings = getHeaderValues(response, 'Content-Encoding');
  if (encodings.length !== 0) {
    fail(path, `expected no Content-Encoding, received "${encodings.join(', ')}"`);
  }
};

const requireGzipContentEncoding = (response: DeliveryResponse, path: string): void => {
  const encodings = getHeaderValues(response, 'Content-Encoding');
  if (encodings.length !== 1) {
    fail(path, `expected exactly one Content-Encoding gzip header, received ${encodings.length}`);
  }
  const encoding = encodings[0]?.trim().toLowerCase() ?? '';
  if (encoding !== 'gzip') {
    fail(path, `expected Content-Encoding gzip, received "${encoding}"`);
  }
};

const requireVaryAcceptEncoding = (response: DeliveryResponse, path: string): void => {
  const varyValues = getHeaderValues(response, 'Vary')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase());
  if (!varyValues.includes('accept-encoding')) {
    fail(path, 'expected Vary to contain Accept-Encoding');
  }
};

const decompressGzip = (body: Buffer, path: string): Buffer => {
  try {
    return gunzipSync(body);
  } catch {
    return fail(path, 'gzip response body could not be decompressed');
  }
};

const parseAttributes = (tag: string): Map<string, string> => {
  const attributes = new Map<string, string>();
  const attributeSource = tag.replace(/^<\/?[^\s>]+/u, '').replace(/\/?\s*>$/u, '');
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  let match = attributePattern.exec(attributeSource);
  while (match !== null) {
    const name = match[1]?.toLowerCase();
    if (name !== undefined && !attributes.has(name)) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? '');
    }
    match = attributePattern.exec(attributeSource);
  }
  return attributes;
};

const normalizeAssetPath = (value: string, origin: URL, label: string): string => {
  const candidate = value.trim();
  if (candidate === '') fail(label, 'asset URL must not be empty');
  if (candidate.includes('\\') || /%2f|%5c/iu.test(candidate)) {
    fail(label, `rejecting traversal-like asset URL "${candidate}"`);
  }
  const decodedCandidate = (() => {
    try {
      return decodeURIComponent(candidate);
    } catch {
      return fail(label, `asset URL contains invalid percent encoding: "${candidate}"`);
    }
  })();
  const rawPath = decodedCandidate.split(/[?#]/u)[0] ?? '';
  if (rawPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    fail(label, `rejecting traversal-like asset URL "${candidate}"`);
  }
  if (!candidate.startsWith('/') && !/^https?:\/\//iu.test(candidate)) {
    fail(label, `asset URL must be root-relative or absolute: "${candidate}"`);
  }
  if (candidate.startsWith('//')) {
    fail(label, `asset URL must not be protocol-relative: "${candidate}"`);
  }

  const assetUrl = (() => {
    try {
      return new URL(candidate, origin);
    } catch {
      return fail(label, `asset URL is invalid: "${candidate}"`);
    }
  })();
  if (assetUrl.origin !== origin.origin) {
    fail(label, `asset URL must be same-origin: "${candidate}"`);
  }
  if (assetUrl.search !== '' || assetUrl.hash !== '') {
    fail(label, `asset URL must not contain a query or fragment: "${candidate}"`);
  }
  return assetUrl.pathname;
};

const parseHtmlAssets = (html: string, origin: URL): ParsedHtmlAssets => {
  const hashedAssets: DeliveryAsset[] = [];
  const stableAssets: string[] = [];
  const seenHashedAssets = new Set<string>();
  const seenStableAssets = new Set<string>();

  const addHashedAsset = (kind: DeliveryAssetKind, value: string, label: string): void => {
    const path = normalizeAssetPath(value, origin, label);
    const extension = kind === 'javascript' ? 'js' : 'css';
    const hashedPathPattern = new RegExp(
      `^/assets/(?:[^/?#]+/)*[^/?#]+-[A-Za-z0-9_-]{8,}\\.${extension}$`,
      'u',
    );
    if (!hashedPathPattern.test(path)) {
      fail(path, `expected a content-hashed /assets/ .${extension} path`);
    }
    const key = `${kind}:${path}`;
    if (!seenHashedAssets.has(key)) {
      seenHashedAssets.add(key);
      hashedAssets.push({ kind, path });
    }
  };

  for (const tag of html.match(/<script\b[^>]*>/giu) ?? []) {
    const attributes = parseAttributes(tag);
    if (attributes.get('type')?.toLowerCase() !== 'module') continue;
    const source = attributes.get('src');
    if (source === undefined) continue;
    const path = normalizeAssetPath(source, origin, 'module script');
    if (!path.toLowerCase().endsWith('.js')) continue;
    addHashedAsset('javascript', source, 'module script');
  }

  for (const tag of html.match(/<link\b[^>]*>/giu) ?? []) {
    const attributes = parseAttributes(tag);
    const href = attributes.get('href');
    if (href === undefined) continue;
    const relValues = (attributes.get('rel') ?? '')
      .split(/\s+/u)
      .map((value) => value.toLowerCase());
    if (relValues.includes('stylesheet')) {
      const path = normalizeAssetPath(href, origin, 'stylesheet');
      if (path.toLowerCase().endsWith('.css')) {
        addHashedAsset('stylesheet', href, 'stylesheet');
      }
    }
    const isStablePwaAsset = relValues.includes('manifest')
      || relValues.includes('icon')
      || relValues.includes('apple-touch-icon');
    if (isStablePwaAsset) {
      const path = normalizeAssetPath(href, origin, 'stable PWA asset');
      if (!seenStableAssets.has(path)) {
        seenStableAssets.add(path);
        stableAssets.push(path);
      }
    }
  }

  if (!hashedAssets.some((asset) => asset.kind === 'javascript')) {
    fail('/index.html', 'expected at least one module-script JavaScript asset');
  }
  if (!hashedAssets.some((asset) => asset.kind === 'stylesheet')) {
    fail('/index.html', 'expected at least one stylesheet asset');
  }
  return { hashedAssets, stableAssets };
};

const verifyHealth = async (
  origin: URL,
  attempts: number,
  retryDelayMs: number,
): Promise<void> => {
  let latestFailure = 'no request was made';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await get(origin, '/healthz', 'identity');
      if (response.statusCode === 200 && response.body.toString('utf8').trim() === 'ok') return;
      latestFailure = `status ${response.statusCode}, body "${response.body.toString('utf8').trim()}"`;
    } catch (error) {
      latestFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await delay(retryDelayMs);
  }
  fail('/healthz', `did not become healthy after ${attempts} attempts (${latestFailure})`);
};

const verifyHashedAsset = async (
  origin: URL,
  asset: DeliveryAsset,
  gzipSizeToleranceBytes: number,
): Promise<VerifiedDeliveryAsset> => {
  const [identityResponse, gzipResponse] = await Promise.all([
    get(origin, asset.path, 'identity'),
    get(origin, asset.path, 'gzip'),
  ]);
  requireStatus(identityResponse, asset.path);
  requireStatus(gzipResponse, asset.path);
  requireNoContentEncoding(identityResponse, asset.path);
  requireGzipContentEncoding(gzipResponse, asset.path);
  requireVaryAcceptEncoding(identityResponse, asset.path);
  requireVaryAcceptEncoding(gzipResponse, asset.path);
  requireCachePolicy(identityResponse, asset.path, immutableCachePolicy);
  requireCachePolicy(gzipResponse, asset.path, immutableCachePolicy);

  const decompressedBody = decompressGzip(gzipResponse.body, asset.path);
  if (!decompressedBody.equals(identityResponse.body)) {
    fail(asset.path, 'gzip response does not decompress to the identity response body');
  }
  if (gzipResponse.body.byteLength >= identityResponse.body.byteLength) {
    fail(asset.path, 'gzip response must be smaller than the identity response');
  }

  const referenceGzipBytes = gzipSync(identityResponse.body).byteLength;
  const gzipDeltaBytes = Math.abs(gzipResponse.body.byteLength - referenceGzipBytes);
  if (gzipDeltaBytes > gzipSizeToleranceBytes) {
    fail(
      asset.path,
      `gzip size delta ${gzipDeltaBytes} exceeds tolerance ${gzipSizeToleranceBytes}`,
    );
  }
  return {
    ...asset,
    identityBytes: identityResponse.body.byteLength,
    gzipBytes: gzipResponse.body.byteLength,
    referenceGzipBytes,
    gzipDeltaBytes,
  };
};

const verifyStableAsset = async (origin: URL, path: string): Promise<void> => {
  const [identityResponse, gzipResponse] = await Promise.all([
    get(origin, path, 'identity'),
    get(origin, path, 'gzip'),
  ]);
  requireStatus(identityResponse, path);
  requireStatus(gzipResponse, path);
  requireCachePolicy(identityResponse, path, stableCachePolicy);
  requireCachePolicy(gzipResponse, path, stableCachePolicy);
  requireNoContentEncoding(identityResponse, path);

  const contentType = identityResponse.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
  if (contentType?.startsWith('image/') === true) {
    requireNoContentEncoding(gzipResponse, path);
    if (!gzipResponse.body.equals(identityResponse.body)) {
      fail(path, 'image response bodies must be byte-identical for identity and gzip requests');
    }
    return;
  }

  const contentEncoding = getHeaderValues(gzipResponse, 'Content-Encoding');
  if (contentEncoding.length === 0) {
    if (!gzipResponse.body.equals(identityResponse.body)) {
      fail(path, 'unencoded response bodies must be byte-identical');
    }
    return;
  }
  requireGzipContentEncoding(gzipResponse, path);
  requireVaryAcceptEncoding(gzipResponse, path);
  const decompressedBody = decompressGzip(gzipResponse.body, path);
  if (!decompressedBody.equals(identityResponse.body)) {
    fail(path, 'gzip response does not decompress to the identity response body');
  }
};

const requireResolvedHtml = (html: string, path: string): void => {
  const viteMarker = html.match(/%VITE_[A-Z0-9_]+%/u)?.[0];
  if (viteMarker !== undefined) fail(path, `contains unresolved marker ${viteMarker}`);
  if (html.includes('__SWELLDAYS_WEB_CONFIG__')) {
    fail(path, 'contains unresolved marker __SWELLDAYS_WEB_CONFIG__');
  }
};

export async function verifyWebDelivery(
  options: VerifyWebDeliveryOptions,
): Promise<WebDeliveryReport> {
  const origin = normalizeOrigin(options.origin);
  const expectedRelease = options.expectedRelease.trim();
  if (expectedRelease === '') throw new Error('expectedRelease must be a non-empty release id');
  const healthAttempts = requireInteger(
    options.healthAttempts,
    defaultHealthAttempts,
    'healthAttempts',
    1,
  );
  const healthRetryDelayMs = requireInteger(
    options.healthRetryDelayMs,
    defaultHealthRetryDelayMs,
    'healthRetryDelayMs',
    0,
  );
  const gzipSizeToleranceBytes = requireInteger(
    options.gzipSizeToleranceBytes,
    defaultGzipSizeToleranceBytes,
    'gzipSizeToleranceBytes',
    0,
  );

  await verifyHealth(origin, healthAttempts, healthRetryDelayMs);

  const releaseResponse = await get(origin, '/release.txt', 'identity');
  requireStatus(releaseResponse, '/release.txt');
  requireNoStore(releaseResponse, '/release.txt');
  const release = releaseResponse.body.toString('utf8').trim();
  if (release !== expectedRelease) {
    fail('/release.txt', `expected release "${expectedRelease}", received "${release}"`);
  }

  const [indexResponse, gzipIndexResponse] = await Promise.all([
    get(origin, '/index.html', 'identity'),
    get(origin, '/index.html', 'gzip'),
  ]);
  requireStatus(indexResponse, '/index.html');
  requireStatus(gzipIndexResponse, '/index.html');
  requireContentType(indexResponse, '/index.html', 'text/html');
  requireContentType(gzipIndexResponse, '/index.html', 'text/html');
  requireNoStore(indexResponse, '/index.html');
  requireNoStore(gzipIndexResponse, '/index.html');
  requireNoContentEncoding(indexResponse, '/index.html');
  requireGzipContentEncoding(gzipIndexResponse, '/index.html');
  requireVaryAcceptEncoding(indexResponse, '/index.html');
  requireVaryAcceptEncoding(gzipIndexResponse, '/index.html');
  const decompressedIndexBody = decompressGzip(gzipIndexResponse.body, '/index.html');
  if (!decompressedIndexBody.equals(indexResponse.body)) {
    fail('/index.html', 'gzip response does not decompress to the identity response body');
  }
  if (gzipIndexResponse.body.byteLength >= indexResponse.body.byteLength) {
    fail('/index.html', 'gzip response must be smaller than the identity response');
  }
  const html = indexResponse.body.toString('utf8');
  requireResolvedHtml(html, '/index.html');
  const assets = parseHtmlAssets(html, origin);

  const hashedAssets = await Promise.all(assets.hashedAssets.map((asset) => (
    verifyHashedAsset(origin, asset, gzipSizeToleranceBytes)
  )));
  await Promise.all(assets.stableAssets.map((path) => verifyStableAsset(origin, path)));

  const fallbackResponse = await get(origin, spaFallbackPath, 'identity');
  requireStatus(fallbackResponse, spaFallbackPath);
  requireContentType(fallbackResponse, spaFallbackPath, 'text/html');
  requireNoStore(fallbackResponse, spaFallbackPath);
  requireNoContentEncoding(fallbackResponse, spaFallbackPath);
  if (!fallbackResponse.body.equals(indexResponse.body)) {
    fail(spaFallbackPath, 'SPA fallback body differs from /index.html');
  }
  requireResolvedHtml(fallbackResponse.body.toString('utf8'), spaFallbackPath);

  return {
    origin: origin.origin,
    release,
    hashedAssets,
    stableAssets: assets.stableAssets,
    spaFallbackPath,
  };
}

export function formatWebDeliveryReport(report: WebDeliveryReport): string {
  const lines = [
    'Web delivery verified',
    `origin: ${report.origin}`,
    `release: ${report.release}`,
  ];
  const kinds: DeliveryAssetKind[] = ['javascript', 'stylesheet'];
  for (const kind of kinds) {
    const assets = report.hashedAssets.filter((asset) => asset.kind === kind);
    if (assets.length === 0) continue;
    const identityBytes = assets.reduce((total, asset) => total + asset.identityBytes, 0);
    const gzipBytes = assets.reduce((total, asset) => total + asset.gzipBytes, 0);
    const referenceGzipBytes = assets.reduce(
      (total, asset) => total + asset.referenceGzipBytes,
      0,
    );
    const gzipDeltaBytes = assets.reduce((total, asset) => total + asset.gzipDeltaBytes, 0);
    lines.push(
      `${kind}: identity=${identityBytes} gzip=${gzipBytes} reference=${referenceGzipBytes} delta=${gzipDeltaBytes} bytes`,
    );
  }
  return `${lines.join('\n')}\n`;
}

const parseCliInteger = (value: string, flag: string, minimum: number): number => {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${flag} must be an integer greater than or equal to ${minimum}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`${flag} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
};

const parseCliOptions = (argumentsList: string[]): VerifyWebDeliveryOptions => {
  const parsed: CliOptions = {};
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (flag === undefined || value === undefined || value.startsWith('--')) {
      throw new Error(`${flag ?? 'argument'} requires a value`);
    }
    if (flag === '--origin') parsed.origin = value;
    else if (flag === '--expected-release') parsed.expectedRelease = value;
    else if (flag === '--health-attempts') {
      parsed.healthAttempts = parseCliInteger(value, flag, 1);
    } else if (flag === '--health-retry-delay-ms') {
      parsed.healthRetryDelayMs = parseCliInteger(value, flag, 0);
    } else if (flag === '--gzip-size-tolerance-bytes') {
      parsed.gzipSizeToleranceBytes = parseCliInteger(value, flag, 0);
    } else {
      throw new Error(`Unknown argument "${flag}"`);
    }
  }
  if (parsed.origin === undefined) throw new Error('--origin is required');
  if (parsed.expectedRelease === undefined || parsed.expectedRelease.trim() === '') {
    throw new Error('--expected-release is required and must be non-empty');
  }
  return {
    origin: parsed.origin,
    expectedRelease: parsed.expectedRelease,
    healthAttempts: parsed.healthAttempts,
    healthRetryDelayMs: parsed.healthRetryDelayMs,
    gzipSizeToleranceBytes: parsed.gzipSizeToleranceBytes,
  };
};

const runCli = async (): Promise<void> => {
  try {
    const options = parseCliOptions(process.argv.slice(2));
    const report = await verifyWebDelivery(options);
    process.stdout.write(formatWebDeliveryReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Web delivery verification failed: ${message}\n`);
    process.exitCode = 1;
  }
};

const invokedPath = process.argv[1];
if (invokedPath !== undefined && fileURLToPath(import.meta.url) === resolve(invokedPath)) {
  void runCli();
}
