import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { AuthModalContext, type AuthModalOpenOptions } from 'entities/Identity';
import { AuthSurfaceBoundary } from './AuthSurfaceBoundary';
import type { AuthMode } from './ui/AuthPage';

export function AuthModalProvider({ children }: { children: ReactNode }): ReactElement {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const continuationRef = useRef<(() => void) | null>(null);

  const open = useCallback((options?: AuthModalOpenOptions) => {
    continuationRef.current = options?.onAuthenticated ?? null;
    setMode('login');
    setOpened(true);
  }, []);

  const close = useCallback(() => {
    continuationRef.current = null;
    setMode('login');
    setOpened(false);
  }, []);

  const handleAuthenticated = useCallback(() => {
    const continuation = continuationRef.current;
    continuationRef.current = null;
    setMode('login');
    setOpened(false);
    continuation?.();
  }, []);

  // The interrupt owns Escape. Mantine attaches one capture-phase window keydown
  // listener per open modal, each closing itself, so a bare Escape would close
  // both the auth interrupt and the content modal beneath it. This provider
  // mounts once at app root — before any content modal — so its capture listener
  // runs first: while the interrupt is open it closes only the interrupt and
  // stops the event before Mantine's per-modal listeners (interrupt + surface
  // beneath) can fire, leaving the surface beneath intact.
  const openedRef = useRef(opened);
  useEffect(() => {
    openedRef.current = opened;
  }, [opened]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || !openedRef.current) return;
      event.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [close]);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      {opened && (
        <AuthSurfaceBoundary
          mode={mode}
          onModeChange={setMode}
          onAuthenticated={handleAuthenticated}
          onClose={close}
        />
      )}
    </AuthModalContext.Provider>
  );
}

export { useAuthModal } from 'entities/Identity';
