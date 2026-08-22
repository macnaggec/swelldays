import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Modal } from '@mantine/core';
import { AuthModalContext, type AuthModalOpenOptions } from 'entities/Identity';
import { resolveModalWorkspacePresentation, useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { AuthPage, type AuthMode } from './ui/AuthPage';
import classes from './AuthModalProvider.module.css';

interface AuthModalViewportStyle extends CSSProperties {
  '--wa-auth-visual-viewport-width': string;
  '--wa-auth-visual-viewport-height': string;
  '--wa-auth-visual-viewport-left': string;
  '--wa-auth-visual-viewport-top': string;
}

export function AuthModalProvider({ children }: { children: ReactNode }): ReactElement {
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const continuationRef = useRef<(() => void) | null>(null);
  const { sizeBand, heightBand } = useViewportCapabilities();
  const {
    visualViewportWidthPx,
    visualViewportHeightPx,
    visualViewportOffsetLeftPx,
    visualViewportOffsetTopPx,
  } = useViewportMetrics();
  const presentation = resolveModalWorkspacePresentation(sizeBand, heightBand);
  const viewportStyle: AuthModalViewportStyle = {
    '--wa-auth-visual-viewport-width': `${visualViewportWidthPx}px`,
    '--wa-auth-visual-viewport-height': `${visualViewportHeightPx}px`,
    '--wa-auth-visual-viewport-left': `${visualViewportOffsetLeftPx}px`,
    '--wa-auth-visual-viewport-top': `${visualViewportOffsetTopPx}px`,
  };

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
      <Modal
        opened={opened}
        onClose={close}
        centered
        size="sm"
        fullScreen={presentation !== 'dialog'}
        title={mode === 'login'
          ? 'Sign in to Swelldays'
          : 'Create your Swelldays account'}
        zIndex="var(--wa-z-modal-interrupt)"
        data-auth-presentation={presentation}
        style={viewportStyle}
        classNames={{
          root: classes.root,
          inner: classes.inner,
          content: classes.content,
          header: classes.header,
          body: classes.body,
          close: classes.close,
        }}
        closeButtonProps={{ 'aria-label': 'Close' }}
      >
        <AuthPage
          mode={mode}
          onModeChange={setMode}
          onSuccess={handleAuthenticated}
        />
      </Modal>
    </AuthModalContext.Provider>
  );
}

export { useAuthModal } from 'entities/Identity';
