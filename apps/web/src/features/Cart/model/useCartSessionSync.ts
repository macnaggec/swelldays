import { useEffect, useRef } from 'react';
import { useUser } from 'shared/hooks/useUser';
import { useCartStore } from 'entities/Commerce';

/**
 * Clears the cart whenever the session transitions from authenticated → unauthenticated.
 * Covers manual sign-out, session expiry, and server-side revocation.
 *
 * Call once at the app root.
 */
export function useCartSessionSync() {
  const { isAuthenticated, isLoading } = useUser();
  const clearCart = useCartStore((s) => s.clear);
  const wasAuthenticatedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (isLoading) return;
    const wasAuthenticated = wasAuthenticatedRef.current;
    // Clear on sign-out transition OR on initial load with stale localStorage items
    if (!isAuthenticated && (wasAuthenticated === true || wasAuthenticated === null)) {
      clearCart();
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading, clearCart]);
}
