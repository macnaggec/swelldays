

import { FC } from 'react';
import { ActionIcon } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';
import classes from './UploadIndicator.module.css';

export interface UploadIconProps {
  /** Icon size (default: 20) */
  size?: number;

  /** Additional class name */
  className?: string;
}

/**
 * UploadIcon - Pure pulsing upload icon
 *
 * Presentational component with no logic or wrappers.
 * Infinite pulse animation while active.
 *
 * @example
 * ```tsx
 * <UploadIcon size={20} />
 * ```
 */
export const UploadIcon: FC<UploadIconProps> = ({
  size = 20,
  className,
}) => {
  return (
    <ActionIcon
      variant="light"
      color="blue"
      size={size + 12}
      radius="md"
      className={`${classes.pulse} ${className || ''}`}
    >
      <IconUpload size={size} />
    </ActionIcon>
  );
};
