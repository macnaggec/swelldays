import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import type { AuthModalSurfaceProps } from './AuthModalSurface';

describe('AuthSurfaceBoundary', () => {
  beforeEach(() => {
    vi.resetModules();
    window.sessionStorage.clear();
  });

  it('loads the surface only once activated and forwards its callbacks', async () => {
    const user = userEvent.setup();
    vi.doMock('./AuthModalSurface', () => ({
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
    }));
    const { AuthSurfaceBoundary } = await import('./AuthSurfaceBoundary');
    const onModeChange = vi.fn();
    const onAuthenticated = vi.fn();
    const onClose = vi.fn();

    render(
      <AuthSurfaceBoundary
        mode="login"
        onModeChange={onModeChange}
        onAuthenticated={onAuthenticated}
        onClose={onClose}
      />,
    );

    expect(await screen.findByRole('dialog', { name: 'Instrumented auth surface' }))
      .toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'switch-mode' }));
    await user.click(screen.getByRole('button', { name: 'authenticate' }));
    await user.click(screen.getByRole('button', { name: 'close-surface' }));

    expect(onModeChange).toHaveBeenCalledWith('register');
    expect(onAuthenticated).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('offers a recoverable fallback after a failed load, and Retry saves the sign-in intent before reloading', async () => {
    const user = userEvent.setup();
    vi.doMock('./AuthModalSurface', () => {
      throw new Error('Auth surface unavailable');
    });
    const { AuthSurfaceBoundary } = await import('./AuthSurfaceBoundary');
    const { consumeAuthReloadIntent } = await import('./authReloadIntent');
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload },
    });

    try {
      const onModeChange = vi.fn();
      const onAuthenticated = vi.fn();
      const onClose = vi.fn();

      render(
        <AuthSurfaceBoundary
          mode="register"
          onModeChange={onModeChange}
          onAuthenticated={onAuthenticated}
          onClose={onClose}
        />,
      );

      expect(await screen.findByRole('heading', { name: 'Sign in unavailable' }))
        .toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(reload).not.toHaveBeenCalled();
      expect(consumeAuthReloadIntent()).toBeNull();

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(reload).toHaveBeenCalledOnce();
      expect(consumeAuthReloadIntent()).toBe('register');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});
