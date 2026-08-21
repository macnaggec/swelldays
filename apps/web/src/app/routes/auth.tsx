import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuthModal } from 'features/Auth';

export const Route = createFileRoute('/auth')({
  component: AuthRoute,
});

/**
 * AuthRoute — redirect handler for direct /auth URL visits.
 *
 * Navigates to root and opens the auth modal, keeping UX consistent
 * with in-app sign-in triggers (header button, upload tab gate, etc.).
 */
function AuthRoute() {
  const navigate = useNavigate();
  const { open } = useAuthModal();

  useEffect(() => {
    void navigate({ to: '/', replace: true });
    open();
  }, [navigate, open]);

  return null;
}
