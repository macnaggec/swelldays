import { webConfig } from 'config/env';

export const apiOrigin = webConfig.apiOrigin;

export function buildApiUrl(path: `/${string}`): string {
  return `${apiOrigin}${path}`;
}
