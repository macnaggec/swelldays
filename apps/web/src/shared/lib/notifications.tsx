import { notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';

/**
 * Centralized notification system
 * Wraps Mantine notifications with consistent styling
 */

export const notify = {
  /**
   * Success notification (green)
   */
  success: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Success',
      message,
      color: 'green',
      icon: <IconCheck size={18} />,
      autoClose: 4000,
    });
  },

  /**
   * Error notification (red)
   */
  error: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Error',
      message,
      color: 'red',
      icon: <IconX size={18} />,
      autoClose: 6000,
    });
  },

  /**
   * Warning notification (yellow)
   */
  warning: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Warning',
      message,
      color: 'yellow',
      icon: <IconAlertTriangle size={18} />,
      autoClose: 5000,
    });
  },

  /**
   * Info notification (blue)
   */
  info: (message: string, title?: string) => {
    notifications.show({
      title: title || 'Info',
      message,
      color: 'blue',
      icon: <IconInfoCircle size={18} />,
      autoClose: 4000,
    });
  },
};
