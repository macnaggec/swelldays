import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAuthModal } from 'entities/Identity';
import { consumeAuthReloadIntent, writeAuthReloadIntent } from './authReloadIntent';
import { AuthModalProvider } from './AuthModalProvider';
import type { AuthSurfaceBoundaryProps } from './AuthSurfaceBoundary';

// The deferred surface owns the forms and viewport presentation; the eager
// controller behavior under test only needs its callback contract.
vi.mock('./AuthSurfaceBoundary', () => ({
  AuthSurfaceBoundary: ({
    mode,
    onModeChange,
    onAuthenticated,
    onClose,
  }: AuthSurfaceBoundaryProps) => (
    <section role="dialog">
      <h2>
        {mode === 'login'
          ? 'Sign in to Swelldays'
          : 'Create your Swelldays account'}
      </h2>
      <div>Auth form</div>
      <button type="button" onClick={() => onModeChange('register')}>show-registration</button>
      <button type="button" onClick={onAuthenticated}>succeed-auth</button>
      <button type="button" onClick={onClose}>dismiss-auth</button>
    </section>
  ),
}));

function Opener({ onAuthenticated }: { onAuthenticated?: () => void } = {}) {
  const { open, close } = useAuthModal();
  return (
    <>
      <button type="button" onClick={() => open()}>open-auth</button>
      <button type="button" onClick={() => open({ onAuthenticated })}>open-auth-gated</button>
      <button type="button" onClick={close}>close-auth</button>
    </>
  );
}

function pressEscape() {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
}

describe('AuthModalProvider — the interrupt owns Escape', () => {
  const surfaceBeneath = vi.fn();

  afterEach(() => {
    window.removeEventListener('keydown', surfaceBeneath, { capture: true });
    surfaceBeneath.mockReset();
  });

  it('closes only the interrupt and shields the content surface beneath it', () => {
    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );
    // Stands in for the content modal (lightbox) already mounted beneath — its
    // own window keydown listener, registered after the provider's.
    window.addEventListener('keydown', surfaceBeneath, { capture: true });

    fireEvent.click(screen.getByText('open-auth'));
    expect(screen.getByText('Auth form')).toBeInTheDocument();

    pressEscape();

    expect(screen.queryByText('Auth form')).not.toBeInTheDocument();
    expect(surfaceBeneath).not.toHaveBeenCalled();
  });

  it('does not intercept Escape when the interrupt is closed', () => {
    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );
    window.addEventListener('keydown', surfaceBeneath, { capture: true });

    pressEscape();

    expect(surfaceBeneath).toHaveBeenCalledTimes(1);
  });
});

describe('AuthModalProvider — one controlled auth workspace', () => {
  it('keeps the opener and closer ready while mounting the surface only when opened', () => {
    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );

    expect(screen.getByText('open-auth')).toBeInTheDocument();
    expect(screen.getByText('close-auth')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('open-auth'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('close-auth'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('starts with one sign-in heading, switches that heading, and resets on reopen', () => {
    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );

    fireEvent.click(screen.getByText('open-auth'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('heading')).toHaveLength(1);
    expect(within(dialog).getByRole('heading', { name: 'Sign in to Swelldays' }))
      .toBeInTheDocument();

    fireEvent.click(within(dialog).getByText('show-registration'));
    expect(within(dialog).getAllByRole('heading')).toHaveLength(1);
    expect(within(dialog).getByRole('heading', { name: 'Create your Swelldays account' }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByText('close-auth'));
    fireEvent.click(screen.getByText('open-auth'));
    const reopenedDialog = screen.getByRole('dialog');
    expect(within(reopenedDialog).getAllByRole('heading')).toHaveLength(1);
    expect(within(reopenedDialog).getByRole('heading', { name: 'Sign in to Swelldays' }))
      .toBeInTheDocument();
  });
});

describe('AuthModalProvider — gated-action continuity', () => {
  it('completes the gated action on successful sign-in', () => {
    const continuation = vi.fn();
    render(
      <AuthModalProvider>
        <Opener onAuthenticated={continuation} />
      </AuthModalProvider>,
    );

    fireEvent.click(screen.getByText('open-auth-gated'));
    fireEvent.click(screen.getByText('succeed-auth'));

    expect(continuation).toHaveBeenCalledOnce();
    expect(screen.queryByText('Auth form')).not.toBeInTheDocument();
  });

  it('discards the intent when the interrupt is dismissed with Escape', () => {
    const continuation = vi.fn();
    render(
      <AuthModalProvider>
        <Opener onAuthenticated={continuation} />
      </AuthModalProvider>,
    );

    fireEvent.click(screen.getByText('open-auth-gated'));
    pressEscape();

    expect(continuation).not.toHaveBeenCalled();
    expect(screen.queryByText('Auth form')).not.toBeInTheDocument();
  });

  it('discards the intent when the interrupt is closed without signing in', () => {
    const continuation = vi.fn();
    render(
      <AuthModalProvider>
        <Opener onAuthenticated={continuation} />
      </AuthModalProvider>,
    );

    fireEvent.click(screen.getByText('open-auth-gated'));
    fireEvent.click(screen.getByText('close-auth'));

    expect(continuation).not.toHaveBeenCalled();
  });

  it('runs the continuation at most once', () => {
    const continuation = vi.fn();
    render(
      <AuthModalProvider>
        <Opener onAuthenticated={continuation} />
      </AuthModalProvider>,
    );

    fireEvent.click(screen.getByText('open-auth-gated'));
    fireEvent.click(screen.getByText('succeed-auth'));
    fireEvent.click(screen.getByText('open-auth'));
    fireEvent.click(screen.getByText('succeed-auth'));

    expect(continuation).toHaveBeenCalledOnce();
  });
});

describe('AuthModalProvider — reopens after a Retry reload', () => {
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('reopens in the saved mode and consumes the stored intent', () => {
    writeAuthReloadIntent('register');

    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Create your Swelldays account' }))
      .toBeInTheDocument();
    expect(consumeAuthReloadIntent()).toBeNull();
  });

  it('stays closed when there is no stored intent', () => {
    render(
      <AuthModalProvider>
        <Opener />
      </AuthModalProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
