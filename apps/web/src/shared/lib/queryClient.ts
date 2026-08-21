import { QueryClient } from '@tanstack/react-query';
import { isTRPCClientError } from '@trpc/client';

const MAX_QUERY_RETRIES = 3;

/**
 * Retry transient failures, but never a deterministic 4xx.
 *
 * A 4xx (bad request, not found, conflict, …) is a settled answer from the server —
 * retrying it just replays the same failure and floods the console (this is what turned
 * one stale-workspace 404 into a burst). Anything else keeps the default bounded retry.
 */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (isTRPCClientError(error)) {
    const status = error.data?.httpStatus;
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: retryQuery } },
});
