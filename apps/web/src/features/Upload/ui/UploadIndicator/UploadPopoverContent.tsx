import { FC } from 'react';
import { Group, Text } from '@mantine/core';
import { IconUpload } from '@tabler/icons-react';

export interface UploadPopoverContentProps {
  spotName: string;
  spotId: string;
  completedCount: number;
  totalCount: number;
  onNavigate?: () => void;
}

/**
 * UploadPopoverContent - Upload progress display.
 * Navigation to upload is now via the sidebar (left strip Upload button).
 */
export const UploadPopoverContent: FC<UploadPopoverContentProps> = ({
  spotName,
  completedCount,
  totalCount,
}) => {
  return (
    <Group gap="xs" wrap="nowrap">
      <IconUpload size={16} />
      <Text size="sm">
        Uploading to{' '}
        <Text component="span" fw={600}>{spotName}</Text>
        {' '}
        <Text component="span" c="dimmed">
          {completedCount}/{totalCount}
        </Text>
      </Text>
    </Group>
  );
};
