import { useCallback, useState, type MouseEvent } from 'react';
import { ActionIcon, Avatar, Menu, Text } from '@mantine/core';
import {
  IconInfoCircle,
  IconLogin,
  IconLogout,
  IconMenu2,
  IconStack2,
  IconUserCircle,
  IconWallet,
  IconX,
} from '@tabler/icons-react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { signOut } from 'shared/lib/auth';
import { useUser } from 'shared/hooks/useUser';
import { preloadAuthSurface, useAuthModal } from 'features/Auth';
import { useFirstVisitPresentation } from 'features/FirstVisit';
import { notify } from 'shared/lib/notifications';
import classes from './MenuControl.module.css';

const SIGN_OUT_ERROR_MESSAGE = "We couldn't sign you out. Please try again.";

// Item icons read as supporting cast to the label text, not competing with it.
const ITEM_ICON_STYLE = { color: 'var(--wa-text-muted)' } as const;

/**
 * MenuControl — top-right menu slot.
 *
 * A single icon opens a popover menu: Sign in for signed-out visitors, or
 * the account identity (with sign out alongside it) plus My
 * Collections/Earnings/Account for signed-in users. The icon itself twists
 * into a close glyph to reflect the popover's open state.
 */
export function MenuControl() {
  const { user, isAuthenticated, isLoading } = useUser();
  const navigate = useNavigate();
  const router = useRouter();
  const { open: openAuthModal } = useAuthModal();
  const presentation = useFirstVisitPresentation();
  const [opened, setOpened] = useState(false);

  const handleSignIn = useCallback(() => openAuthModal(), [openAuthModal]);
  const handleSignInIntent = useCallback(() => {
    void preloadAuthSurface();
  }, []);
  const handleSignOut = useCallback(async () => {
    try {
      const result = await signOut();

      if (result.error) {
        notify.error(SIGN_OUT_ERROR_MESSAGE, 'Sign Out Failed');
        return;
      }

      await navigate({ to: '/' });
    } catch {
      notify.error(SIGN_OUT_ERROR_MESSAGE, 'Sign Out Failed');
    }
  }, [navigate]);
  const handleSignOutClick = useCallback(() => {
    setOpened(false);
    void handleSignOut();
  }, [handleSignOut]);
  const handleGoToCollection = useCallback(() => navigate({ to: '/me/collections' }), [navigate]);
  const handleGoToEarnings = useCallback(() => navigate({ to: '/me/earnings' }), [navigate]);
  const handleOpenAccount = useCallback(() => navigate({ to: '/me' }), [navigate]);
  const handleOpenPresentation = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
    if (!presentation || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    setOpened(false);
    presentation.open();
  }, [presentation]);
  const handleGoToAbout = useCallback(() => navigate({ to: '/about' }), [navigate]);
  const preloadMenuRoutes = useCallback(() => {
    const requests = [router.preloadRoute({ to: '/about' })];
    if (isAuthenticated) {
      requests.push(
        router.preloadRoute({ to: '/me/collections' }),
        router.preloadRoute({ to: '/me/earnings' }),
        router.preloadRoute({ to: '/me' }),
      );
    }

    void Promise.allSettled(requests);
  }, [isAuthenticated, router]);

  if (isLoading) return null;

  const initials = (user?.name ?? user?.email ?? '?').slice(0, 2).toUpperCase();

  return (
    <Menu position="right" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <ActionIcon
          variant="transparent"
          color="gray"
          size="lg"
          aria-label={opened ? 'Close menu' : 'Open menu'}
          onPointerEnter={preloadMenuRoutes}
          onPointerDown={preloadMenuRoutes}
          onFocus={preloadMenuRoutes}
          data-opened={opened || undefined}
          className={classes.trigger}
        >
          {opened ? <IconX size={18} /> : <IconMenu2 size={18} />}
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown miw={252}>
        {isAuthenticated ? (
          <>
            <div className={classes.identity}>
              <Avatar
                src={user?.image ?? undefined}
                alt={user?.name ?? user?.email}
                size={40}
                radius="xl"
                color="gray"
                variant="outline"
              >
                {initials}
              </Avatar>
              <div className={classes.identityText}>
                <Text className={classes.identityName}>{user?.name ?? 'Your account'}</Text>
                <Text className={classes.identityEmail}>{user?.email}</Text>
              </div>
              <ActionIcon
                variant="transparent"
                color="gray"
                size={40}
                aria-label="Sign out"
                className={classes.signOut}
                onClick={handleSignOutClick}
              >
                <IconLogout size={20} stroke={1.75} />
              </ActionIcon>
            </div>
            <Menu.Divider />
            <Menu.Item
              leftSection={<IconStack2 size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
              onClick={handleGoToCollection}
            >
              My Collections
            </Menu.Item>
            <Menu.Item
              leftSection={<IconWallet size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
              onClick={handleGoToEarnings}
            >
              Earnings
            </Menu.Item>
            <Menu.Item
              leftSection={<IconUserCircle size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
              onClick={handleOpenAccount}
            >
              Account
            </Menu.Item>
          </>
        ) : (
          <Menu.Item
            leftSection={<IconLogin size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
            onClick={handleSignIn}
            onPointerEnter={handleSignInIntent}
            onPointerDown={handleSignInIntent}
            onFocus={handleSignInIntent}
          >
            Sign in
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item component="a" href="/#intro" onClick={handleOpenPresentation}
          leftSection={<IconInfoCircle size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
        >
          How it works
        </Menu.Item>
        <Menu.Item
          leftSection={<IconInfoCircle size={16} stroke={1.75} style={ITEM_ICON_STYLE} />}
          onClick={handleGoToAbout}
        >
          About
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
