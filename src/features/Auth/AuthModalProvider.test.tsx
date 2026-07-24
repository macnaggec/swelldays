import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { useAuthModal } from 'entities/Identity';
import { AuthModalProvider } from './AuthModalProvider';

// AuthPage drags in the login/register forms and their data layer; the interrupt
// dismissal behavior under test doesn't need them.
vi.mock('./ui/AuthPage', () => ({
  AuthPage: () => <div>Auth form</div>,
}));

function Opener() {
  const { open } = useAuthModal();
  return <button type="button" onClick={open}>open-auth</button>;
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
