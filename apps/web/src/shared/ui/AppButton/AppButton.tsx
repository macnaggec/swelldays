import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Button } from '@mantine/core';
import styles from './AppButton.module.css';

export type AppButtonTone = 'neutral' | 'highlight' | 'positive' | 'destructive';

type NativeButtonProps = Omit<
  ComponentPropsWithoutRef<'button'>,
  'children' | 'className' | 'color' | 'style'
>;

export interface AppButtonProps extends NativeButtonProps {
  children: ReactNode;
  tone?: AppButtonTone;
  loading?: boolean;
  leftSection?: ReactNode;
  rightSection?: ReactNode;
  indicator?: ReactNode;
  fullWidth?: boolean;
  className?: string;
  renderRoot?: (props: ComponentPropsWithoutRef<'a'>) => ReactNode;
}

export function AppButton({
  children,
  tone = 'neutral',
  loading = false,
  disabled = false,
  type = 'button',
  leftSection,
  rightSection,
  indicator,
  fullWidth,
  className,
  renderRoot,
  ...buttonProps
}: AppButtonProps) {
  const isLocked = disabled || loading;

  return (
    <Button
      {...buttonProps}
      type={type}
      variant="transparent"
      className={className ? `${styles.root} ${className}` : styles.root}
      classNames={{ label: styles.label }}
      leftSection={leftSection}
      rightSection={rightSection}
      fullWidth={fullWidth}
      loading={loading}
      disabled={isLocked}
      renderRoot={renderRoot}
      data-app-button
      data-app-button-tone={tone}
      data-app-button-disabled={isLocked ? 'true' : undefined}
      data-app-button-loading={loading ? 'true' : undefined}
      data-app-button-indicator={indicator ? 'true' : undefined}
    >
      {children}
      {indicator}
    </Button>
  );
}
