const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim() ?? '';

export const apiOrigin = configuredApiOrigin.replace(/\/+$/, '');

export function buildApiUrl(path: `/${string}`): string {
  return `${apiOrigin}${path}`;
}
