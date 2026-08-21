import { fireEvent, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { Route } from './_panel.me';

const mocks = vi.hoisted(() => ({
  isAuthenticated: true,
  isLoading: false,
  openAuthModal: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => options,
  Outlet: () => <div data-testid="me-outlet" />,
}));

vi.mock('shared/hooks/useUser', () => ({
  useUser: () => ({ isAuthenticated: mocks.isAuthenticated, isLoading: mocks.isLoading }),
}));

vi.mock('entities/Identity', () => ({
  useAuthModal: () => ({ open: mocks.openAuthModal }),
}));

describe('MeLayout', () => {
  it('offers sign-in instead of the tabs/outlet when unauthenticated', () => {
    mocks.isAuthenticated = false;
    mocks.isLoading = false;
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.getByText('Sign in to view your workspace')).not.toBeNull();
    expect(screen.queryByText('Uploads')).toBeNull();
    expect(screen.queryByTestId('me-outlet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.openAuthModal).toHaveBeenCalledOnce();
  });

  it('renders only the workspace outlet for authenticated users', () => {
    mocks.isAuthenticated = true;
    mocks.isLoading = false;
    const Component = (Route as unknown as { component: ComponentType }).component;

    render(<Component />);

    expect(screen.queryByText('Uploads')).toBeNull();
    expect(screen.getByTestId('me-outlet')).not.toBeNull();
  });
});
