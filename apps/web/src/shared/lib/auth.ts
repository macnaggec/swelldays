import { createAuthClient } from 'better-auth/react';
import { apiOrigin } from 'shared/lib/apiOrigin';

export const authClient = createAuthClient({
  ...(apiOrigin ? { baseURL: apiOrigin } : {}),
  fetchOptions: {
    credentials: 'include',
  },
});

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = authClient;
