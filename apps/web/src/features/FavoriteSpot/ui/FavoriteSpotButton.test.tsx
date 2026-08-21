import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { FavoriteSpotButton } from './FavoriteSpotButton';

const mocks = vi.hoisted(() => ({
  isFavorited: false,
  toggleFavorite: vi.fn(),
}));

vi.mock('entities/Spot', () => ({
  useFavoriteSpot: () => ({
    isFavorited: mocks.isFavorited,
    toggleFavorite: mocks.toggleFavorite,
    isPending: false,
  }),
}));

describe('FavoriteSpotButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isFavorited = false;
  });

  it('shows an "Add to favorites" action when the spot is not favorited', () => {
    render(<FavoriteSpotButton spotId="spot-1" />);

    expect(screen.getByRole('button', { name: /add to favorites/i })).toBeInTheDocument();
  });

  it('shows a "Remove from favorites" action when the spot is already favorited', () => {
    mocks.isFavorited = true;
    render(<FavoriteSpotButton spotId="spot-1" />);

    expect(screen.getByRole('button', { name: /remove from favorites/i })).toBeInTheDocument();
  });

  it('toggles favorite state on click', () => {
    render(<FavoriteSpotButton spotId="spot-1" />);

    fireEvent.click(screen.getByRole('button', { name: /add to favorites/i }));

    expect(mocks.toggleFavorite).toHaveBeenCalledTimes(1);
  });
});
