/**
 * Client-safe helper to extract a user-facing message from unknown errors.
 *
 * Keep this free of server-only imports so it can be used in client components/hooks.
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message || 'An unexpected error occurred';

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') return maybeMessage;

    // Some responses are shaped like: { error: { message: string } }
    const nested = (error as { error?: unknown }).error;
    if (typeof nested === 'object' && nested !== null) {
      const nestedMessage = (nested as { message?: unknown }).message;
      if (typeof nestedMessage === 'string') return nestedMessage;
    }
  }

  return 'An unexpected error occurred';
}
