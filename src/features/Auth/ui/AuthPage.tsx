import { Anchor, Group, Text } from '@mantine/core';
import { useCallback, useRef, type PointerEvent, type ReactElement } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import classes from './AuthPage.module.css';

export type AuthMode = 'login' | 'register';

export interface AuthPageProps {
  readonly mode: AuthMode;
  readonly onModeChange: (mode: AuthMode) => void;
  readonly onSuccess?: () => void;
}

interface AuthPointerGesture {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
}

const KEYBOARD_DISMISS_DISTANCE_PX = 36;
const INTERACTIVE_TARGET_SELECTOR = 'input, button, a';

export function AuthPage({ mode, onModeChange, onSuccess }: AuthPageProps): ReactElement {
  const pointerGestureRef = useRef<AuthPointerGesture | null>(null);

  const handleRegistrationSuccess = useCallback(() => {
    onModeChange('login');
  }, [onModeChange]);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    const startedOnInteractiveControl = target instanceof Element
      && target.closest(INTERACTIVE_TARGET_SELECTOR) !== null;
    if (
      event.pointerType !== 'touch'
      || !event.isPrimary
      || event.button !== 0
      || event.currentTarget.scrollTop > 0
      || startedOnInteractiveControl
    ) {
      pointerGestureRef.current = null;
      return;
    }

    pointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const gesture = pointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const horizontalDistance = Math.abs(event.clientX - gesture.startX);
    const downwardDistance = event.clientY - gesture.startY;
    if (
      downwardDistance < KEYBOARD_DISMISS_DISTANCE_PX
      || downwardDistance <= horizontalDistance
    ) return;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
      activeElement.blur();
    }
    pointerGestureRef.current = null;
  }, []);

  const disarmPointerGesture = useCallback(() => {
    pointerGestureRef.current = null;
  }, []);

  return (
    <div
      className={classes.scrollSurface}
      data-auth-scroll-surface
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={disarmPointerGesture}
      onPointerCancel={disarmPointerGesture}
    >
      <div className={classes.content}>
        {mode === 'login' && <LoginForm onSuccess={onSuccess} />}
        {mode === 'register' && <RegisterForm onSuccess={handleRegistrationSuccess} />}

        <Group className={classes.modePrompt} wrap="wrap">
          <Text size="sm" className={classes.modeQuestion}>
            {mode === 'register' ? 'Already have an account?' : "Don't have an account?"}
          </Text>
          <Anchor
            component="button"
            type="button"
            size="xs"
            className={classes.modeSwitch}
            onClick={() => onModeChange(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'register' ? 'Sign in' : 'Register'}
          </Anchor>
        </Group>
      </div>
    </div>
  );
}
