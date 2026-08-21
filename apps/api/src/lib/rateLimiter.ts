import { TooManyRequestsError } from 'server/errors';

// Opaque rate-limiter interface — swappable behind this type when moving to distributed state.
export type RateLimiter = (key: string) => void;

// In-memory sliding-window rate limiter. Not suitable for multi-instance deployments.
export function createRateLimiter(options: {
  windowMs: number;
  max: number
}): RateLimiter {
  const store = new Map<string, number[]>();

  return function check(key: string): void {
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const hits = (store.get(key) ?? []).filter((t) => t > windowStart);

    if (hits.length >= options.max) {
      throw new TooManyRequestsError('Rate limit exceeded');
    }

    hits.push(now);
    store.set(key, hits);
  };
}
