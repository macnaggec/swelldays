declare module '@tanstack/history' {
  interface HistoryState {
    firstVisitReturnHref?: string;
  }
}

/** History state must never become an external redirect or an intro loop. */
export function firstVisitReturnHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\u0000-\u0020\\]/.test(value)) return undefined;
  const url = new URL(value, 'https://swelldays.surf');
  if (url.origin !== 'https://swelldays.surf') return undefined;
  if (url.hash === '#intro') url.hash = url.pathname === '/' ? '#map' : '';
  return `${url.pathname}${url.search}${url.hash}`;
}
