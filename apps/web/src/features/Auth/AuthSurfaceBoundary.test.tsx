import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import type { AuthModalSurfaceProps } from './AuthModalSurface';

const lifecycle = vi.hoisted(() => ({
  moduleLoads: 0,
  rejectNextModuleLoad: false,
}));

vi.mock('./AuthModalSurface', async () => {
  lifecycle.moduleLoads += 1;
  if (lifecycle.rejectNextModuleLoad) {
    lifecycle.rejectNextModuleLoad = false;
    throw new Error('Auth surface unavailable');
  }

  return {
    AuthModalSurface: ({
      mode,
      onModeChange,
      onAuthenticated,
      onClose,
    }: AuthModalSurfaceProps) => (
      <section role="dialog" aria-label="Instrumented auth surface">
        <div>Auth mode: {mode}</div>
        <button type="button" onClick={() => onModeChange('register')}>switch-mode</button>
        <button type="button" onClick={onAuthenticated}>authenticate</button>
        <button type="button" onClick={onClose}>close-surface</button>
      </section>
    ),
  };
});

describe('AuthSurfaceBoundary', () => {
  it('defers loading, offers Close after failure, and retries with a fresh module load', async () => {
    const user = userEvent.setup();
    const { AuthSurfaceBoundary } = await import('./AuthSurfaceBoundary');
    const onModeChange = vi.fn();
    const onAuthenticated = vi.fn();
    const onClose = vi.fn();

    expect(lifecycle.moduleLoads).toBe(0);
    lifecycle.rejectNextModuleLoad = true;

    render(
      <AuthSurfaceBoundary
        mode="login"
        onModeChange={onModeChange}
        onAuthenticated={onAuthenticated}
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Sign in unavailable' }))
      .toBeInTheDocument();
    expect(lifecycle.moduleLoads).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onModeChange).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('dialog', { name: 'Instrumented auth surface' }))
      .toBeInTheDocument();
    expect(lifecycle.moduleLoads).toBe(2);

    await user.click(screen.getByRole('button', { name: 'switch-mode' }));
    await user.click(screen.getByRole('button', { name: 'authenticate' }));
    await user.click(screen.getByRole('button', { name: 'close-surface' }));

    expect(onModeChange).toHaveBeenCalledWith('register');
    expect(onAuthenticated).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
