import { createContext, useContext } from 'react';

export interface AuthModalOpenOptions {
  /**
   * Runs once after a successful sign-in from this interrupt, so an auth-gated
   * action completes without the user re-triggering it. Discarded on dismissal.
   */
  onAuthenticated?: () => void;
}

export interface AuthModalContextValue {
  open: (options?: AuthModalOpenOptions) => void;
  close: () => void;
}

export const AuthModalContext = createContext<
  AuthModalContextValue | null
>(null);

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within AuthModalProvider');

  return ctx;
}
