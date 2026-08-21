import { screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { Route } from './_panel.me.collections.favorites';

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
}));

vi.mock('./_panel.me.collections', () => ({
  useCollectionsContext: () => ({
    favorites: [],
    visibleFavorites: [],
    isLoadingFavorites: false,
  }),
}));

vi.mock('entities/Media', () => ({
  useMediaFavorites: () => ({ favoriteIds: new Set(), toggleFavorite: vi.fn() }),
}));

vi.mock('shared/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'user-1' } }) }));

describe('FavoritesTab', () => {
  it('renders favorites empty state inside the shared panel gallery inset', () => {
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByText('Your favorites will appear here.').closest('[data-panel-gallery-inset]')).not.toBeNull();
  });
});
