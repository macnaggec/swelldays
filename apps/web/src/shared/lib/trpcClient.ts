import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '@swelldays/api/router';
import { buildApiUrl } from 'shared/lib/apiOrigin';
import { queryClient } from 'shared/lib/queryClient';

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: buildApiUrl('/api/trpc'),
      transformer: superjson,
      fetch: (input, init) => globalThis.fetch(input, {
        ...init,
        credentials: 'include',
      }),
    })
  ],
});

/** Type-safe proxy for use in route loaders (non-React context). */
export const trpcProxy = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
