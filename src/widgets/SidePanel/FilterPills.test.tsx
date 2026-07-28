import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { FilterPills } from './FilterPills';

describe('FilterPills favorites filter', () => {
  it('exposes which date filter is selected', () => {
    const { rerender } = render(
      <FilterPills
        active="today"
        onChange={vi.fn()}
        favoritesOnly={false}
        onFavoritesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Yesterday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Last 7 Days' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <FilterPills
        active={{ date: new Date('2026-07-18T12:00:00.000Z') }}
        onChange={vi.fn()}
        favoritesOnly={false}
        onFavoritesChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /Jul 18/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles favorites independently of the active date filter', () => {
    const onChange = vi.fn();
    const onFavoritesChange = vi.fn();

    render(
      <FilterPills
        active="today"
        onChange={onChange}
        favoritesOnly={false}
        onFavoritesChange={onFavoritesChange}
      />,
    );

    const favorites = screen.getByRole('button', { name: 'Favorites' });
    expect(favorites).toHaveAttribute('aria-pressed', 'false');
    expect(favorites.style.background).toBe('var(--wa-panel-control-background, var(--wa-control-fill))');
    expect(favorites.style.backdropFilter).toBe('var(--wa-panel-control-backdrop, blur(10px))');
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();

    fireEvent.click(favorites);

    expect(onFavoritesChange).toHaveBeenCalledWith(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the selected state as an opaque accent fill with ink text', () => {
    render(
      <FilterPills active={null} onChange={vi.fn()} favoritesOnly onFavoritesChange={vi.fn()} />,
    );

    const favorites = screen.getByRole('button', { name: 'Favorites' });
    expect(favorites).toHaveAttribute('aria-pressed', 'true');
    expect(favorites.style.background).toBe('var(--wa-control-fill-selected)');
    expect(favorites.style.color).toBe('var(--wa-text-on-accent)');
    // Opaque fill needs no backdrop blur — the glass blur must not leak into the selected state.
    expect(favorites.style.backdropFilter).toBe('none');
  });
});
