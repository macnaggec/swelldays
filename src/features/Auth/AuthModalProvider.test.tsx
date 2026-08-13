import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAuthModal } from 'entities/Identity';
import { AuthModalProvider } from './AuthModalProvider';

// AuthPage drags in the login/register forms and their data layer; the interrupt
// dismissal behavior under test doesn't need them.
vi.mock('./ui/AuthPage', () => ({
  AuthPage: ({
    mode,
    onModeChange,
    onSuccess,
  }: {
    mode: 'login' | 'register';
    onModeChange: (mode: 'login' | 'register') => void;
    onSuccess?: () => void;
  }) => (
    <>
      <div>Auth form</div>
      <div>Auth mode: {mode}</div>
      <button type="button" onClick={() => onModeChange('register')}>show-registration</button>
      <button type="button" onClick={() => onSuccess?.()}>succeed-auth</button>
    </>
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
