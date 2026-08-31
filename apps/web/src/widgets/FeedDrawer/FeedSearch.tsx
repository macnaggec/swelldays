import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { SpotSearch } from 'features/SpotSearch';
import { preloadAddSpotUi, useAddSpot } from 'features/AddSpot';
import { useUser } from 'shared/hooks/useUser';
import { preloadAuthSurface, useAuthModal } from 'features/Auth';
import type { Spot } from 'entities/Spot';
import { AppButton } from 'shared/ui/AppButton';

interface FeedSearchProps {
  placeholder?: string;
  onSpotSelect?: (spot: Spot) => void;
  /** When provided, overrides mapStore.selection for chip display. */
  activeSpot?: Pick<Spot, 'id' | 'name' | 'location'> | null;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function FeedSearch({ placeholder, onSpotSelect, activeSpot: activeSpotOverride, onClear, autoFocus }: FeedSearchProps = {}) {
  const selection = activeSpotOverride ?? null;
  const navigate = useNavigate();
  const { startAddSpot } = useAddSpot();
  const { isAuthenticated } = useUser();
  const { open: openAuthModal } = useAuthModal();

  const handleAddSpotIntent = useCallback((): void => {
    void preloadAddSpotUi();
  }, []);

  const handleSignInIntent = useCallback((): void => {
    void preloadAuthSurface();
  }, []);

  const handleSelect = useCallback((spot: Spot) => {
    if (onSpotSelect) {
      onSpotSelect(spot);
    } else {
      void navigate({ to: '/$spotId', params: { spotId: spot.slug } });
    }
  }, [navigate, onSpotSelect]);

  const emptyAction = useCallback(
    (search: string): ReactNode => {
      if (isAuthenticated) {
        return (
          <AppButton
            tone="highlight"
            onPointerEnter={handleAddSpotIntent}
            onPointerDown={handleAddSpotIntent}
            onFocus={handleAddSpotIntent}
            onClick={() => startAddSpot(search)}
          >
            Add as a new spot
          </AppButton>
        );
      }
      return (
        <Text
          size="sm"
          c="dimmed"
          style={{ cursor: 'pointer' }}
          onClick={() => openAuthModal()}
          onPointerEnter={handleSignInIntent}
          onPointerDown={handleSignInIntent}
          onFocus={handleSignInIntent}
        >
          Sign in to add as a new spot
        </Text>
      );
    },
    [handleAddSpotIntent, handleSignInIntent, isAuthenticated, startAddSpot, openAuthModal],
  );

  return (
    <SpotSearch
      onSpotSelect={handleSelect}
      emptyAction={emptyAction}
      placeholder={placeholder}
      onClear={onClear ?? (() => { void navigate({ to: '/' }); })}
      activeSpot={selection}
      autoFocus={autoFocus}
    />
  );
}
