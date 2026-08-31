import { Modal } from '@mantine/core';
import { type CSSProperties, type ReactElement } from 'react';
import { resolveModalWorkspacePresentation, useViewportCapabilities } from 'shared/model/viewportCapabilities';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import classes from './AuthModalProvider.module.css';
import { AuthPage } from './ui/AuthPage';
import type { AuthMode } from './ui/AuthPage';

export interface AuthModalSurfaceProps {
  readonly mode: AuthMode;
  readonly onModeChange: (mode: AuthMode) => void;
  readonly onAuthenticated: () => void;
  readonly onClose: () => void;
}

interface AuthModalViewportStyle extends CSSProperties {
  '--wa-auth-visual-viewport-width': string;
  '--wa-auth-visual-viewport-height': string;
  '--wa-auth-visual-viewport-left': string;
  '--wa-auth-visual-viewport-top': string;
}

export function AuthModalSurface({
  mode,
  onModeChange,
  onAuthenticated,
  onClose,
}: AuthModalSurfaceProps): ReactElement {
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

  return (
    <Modal
      opened
      onClose={onClose}
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
        onModeChange={onModeChange}
        onSuccess={onAuthenticated}
      />
    </Modal>
  );
}
