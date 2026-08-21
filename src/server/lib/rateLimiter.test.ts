import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRateLimiter } from 'server/lib/rateLimiter';
import { TooManyRequestsError } from 'server/errors';

afterEach(() => {
  vi.useRealTimers();
});

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    vi.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 3 });

    expect(() => check('user-1')).not.toThrow();
    expect(() => check('user-1')).not.toThrow();
    expect(() => check('user-1')).not.toThrow();
  });

  it('throws TooManyRequestsError when limit is exceeded', () => {
    vi.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 2 });

    check('user-1');
    check('user-1');

    expect(() => check('user-1')).toThrow(TooManyRequestsError);
  });

  it('resets count after the window expires', () => {
    vi.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 2 });

    check('user-1');
    check('user-1');

    vi.advanceTimersByTime(61_000);

    expect(() => check('user-1')).not.toThrow();
  });

  it('tracks different keys independently', () => {
    vi.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 1 });

    check('user-1');
    check('user-2');

    expect(() => check('user-1')).toThrow(TooManyRequestsError);
    expect(() => check('user-2')).toThrow(TooManyRequestsError);
  });

  it('does not count expired hits toward the limit', () => {
    vi.useFakeTimers();
    const check = createRateLimiter({ windowMs: 60_000, max: 2 });

    check('user-1');
    vi.advanceTimersByTime(61_000);
    check('user-1'); // this is the first hit in the new window

    // only 1 hit in the current window — should not throw
    expect(() => check('user-1')).not.toThrow();
  });
});
