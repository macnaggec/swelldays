export interface MapLoadFailure {
  error: Error;
  fatal: boolean;
}

/** A tile/sprite/network error alone does not prove that the map cannot load. */
export function classifyMapLoadFailure(error: Error): MapLoadFailure {
  if (error.message === 'Failed to initialize WebGL' || error.message === 'Map is not supported by this browser') return { error, fatal: true };
  if ('url' in error && typeof error.url === 'string' && 'status' in error && typeof error.status === 'number') {
    try {
      const url = new URL(error.url);
      const rootStyle = url.hostname === 'api.mapbox.com' && /^\/styles\/v1\/[^/]+\/[^/]+\/?$/.test(url.pathname);
      return { error, fatal: rootStyle && [400, 401, 403, 404, 410].includes(error.status) };
    } catch { /* A malformed URL provides no evidence of a fatal style failure. */ }
  }
  return { error, fatal: false };
}
