import { ActionIcon, Avatar, Menu, Tooltip } from '@mantine/core';
import { IconLogin } from '@tabler/icons-react';
import { signOut } from 'shared/lib/auth';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useUser } from 'shared/hooks/useUser';
import { useAuthModal } from 'features/Auth';

/**
 * UserControl — auth-aware top-right slot.
 *
 * Renders a user avatar menu when authenticated,
 * or a Sign in button for unauthenticated visitors.
 */
export function UserControl() {
  const { user, isAuthenticated, isLoading } = useUser();
  const navigate = useNavigate();
  const { open: openAuthModal } = useAuthModal();

  const handleSignIn = useCallback(() => openAuthModal(), [openAuthModal]);
  const handleSignOut = useCallback(() => void signOut(), []);
  const handleGoToCollection = useCallback(() => navigate({ to: '/me/collections' }), [navigate]);
  const handleGoToEarnings = useCallback(() => navigate({ to: '/me/earnings' }), [navigate]);
  const handleOpenAccount = useCallback(() => navigate({ to: '/me' }), [navigate]);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <Tooltip label="Sign in" position="right">
        <ActionIcon
          variant="transparent"
          size="lg"
          aria-label="Sign in"
          onClick={handleSignIn}
          style={{ color: 'rgba(255,255,255,0.75)' }}
        >
          <IconLogin size={18} />
        </ActionIcon>
      </Tooltip>
    );
  }

  const initials = (user?.name ?? user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <Menu position="right">
      <Menu.Target>
        <Avatar
          src={user?.image}
          alt={user?.name ?? 'User'}
          variant="outline"
          color="gray"
          radius="xl"
          size={34}
          style={{ cursor: 'pointer' }}
        >
          {initials}
        </Avatar>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={handleGoToCollection}>My Collections</Menu.Item>
        <Menu.Item onClick={handleGoToEarnings}>Earnings</Menu.Item>
        <Menu.Item onClick={handleOpenAccount}>Account</Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" onClick={handleSignOut}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu >
  );
}
