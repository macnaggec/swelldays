import {
  Component,
  Suspense,
  createElement,
  lazy,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import classes from './AuthSurfaceBoundary.module.css';
import type { AuthMode } from './ui/AuthPage';

export interface AuthSurfaceBoundaryProps {
  readonly mode: AuthMode;
  readonly onModeChange: (mode: AuthMode) => void;
  readonly onAuthenticated: () => void;
  readonly onClose: () => void;
}

let authSurfacePromise: Promise<typeof import('./AuthModalSurface')> | null = null;

export function loadAuthSurface(): Promise<typeof import('./AuthModalSurface')> {
  if (!authSurfacePromise) {
    authSurfacePromise = import('./AuthModalSurface').catch((error: unknown) => {
      authSurfacePromise = null;
      throw error;
    });
  }

  return authSurfacePromise;
}

function createLazyAuthModalSurface() {
  return lazy(() => loadAuthSurface().then(({ AuthModalSurface }) => ({
    default: AuthModalSurface,
  })));
}

interface AuthSurfaceErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}

interface AuthSurfaceErrorBoundaryState {
  readonly hasError: boolean;
}

class AuthSurfaceErrorBoundary extends Component<
  AuthSurfaceErrorBoundaryProps,
  AuthSurfaceErrorBoundaryState
> {
  state: AuthSurfaceErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AuthSurfaceErrorBoundaryState {
    return { hasError: true };
  }

  render(): ReactNode {
    const { children, onClose, onRetry } = this.props;

    if (!this.state.hasError) return children;

    return (
      <div className={classes.backdrop}>
        <section
          className={classes.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-surface-load-error-title"
        >
          <h2 id="auth-surface-load-error-title" className={classes.title}>
            Sign in unavailable
          </h2>
          <p className={classes.message}>
            The sign-in screen couldn’t load. Try again or close this message.
          </p>
          <div className={classes.actions}>
            <button type="button" className={classes.button} onClick={onClose}>Close</button>
            <button
              type="button"
              className={`${classes.button} ${classes.retryButton}`}
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        </section>
      </div>
    );
  }
}

export function AuthSurfaceBoundary({
  mode,
  onModeChange,
  onAuthenticated,
  onClose,
}: AuthSurfaceBoundaryProps): ReactElement {
  const [retryGeneration, setRetryGeneration] = useState(0);
  const LazyAuthModalSurface = useMemo(
    () => {
      void retryGeneration;
      return createLazyAuthModalSurface();
    },
    [retryGeneration],
  );
  const retry = () => setRetryGeneration((generation) => generation + 1);
  const surface = createElement(LazyAuthModalSurface, {
    mode,
    onModeChange,
    onAuthenticated,
    onClose,
  });

  return (
    <Suspense fallback={null}>
      <AuthSurfaceErrorBoundary
        key={retryGeneration}
        onClose={onClose}
        onRetry={retry}
      >
        {surface}
      </AuthSurfaceErrorBoundary>
    </Suspense>
  );
}
