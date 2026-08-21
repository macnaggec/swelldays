import { describe, expect, it } from 'vitest';
import { TRPCClientError } from '@trpc/client';
import { retryQuery } from './queryClient';

function trpcError(httpStatus: number): TRPCClientError<never> {
  return TRPCClientError.from({ error: { message: 'x', code: -32000, data: { httpStatus } } } as never);
}

describe('retryQuery', () => {
  it('never retries a 4xx (deterministic, settled answer)', () => {
    expect(retryQuery(0, trpcError(404))).toBe(false);
    expect(retryQuery(0, trpcError(400))).toBe(false);
    expect(retryQuery(0, trpcError(409))).toBe(false);
  });

  it('retries a 5xx up to the cap', () => {
    expect(retryQuery(0, trpcError(500))).toBe(true);
    expect(retryQuery(2, trpcError(500))).toBe(true);
    expect(retryQuery(3, trpcError(500))).toBe(false);
  });

  it('retries non-tRPC errors up to the cap', () => {
    expect(retryQuery(0, new Error('network down'))).toBe(true);
    expect(retryQuery(3, new Error('network down'))).toBe(false);
  });
});
