import { FC, memo, useMemo } from 'react';
import { Group, Loader, Text, ThemeIcon } from '@mantine/core';
import { IconCheck, IconPhoto, IconVideo } from '@tabler/icons-react';
import { GalleryCard, getUploadQueueStatus } from '../../model';
import styles from './UploadStatusLabel.module.css';

export interface UploadStatusLabelProps {
  items: GalleryCard[];
  hasActiveUploads: boolean;
  onOpen: () => void;
}

export const UploadStatusLabel: FC<UploadStatusLabelProps> = memo(({ items, hasActiveUploads, onOpen }) => {
  const { readyItems, uploadingCount } = useMemo(() => getUploadQueueStatus(items), [items]);

  const photoCount = readyItems.filter(c => c.kind !== 'attempt' && c.result.resource.resourceType !== 'video').length;
  const videoCount = readyItems.filter(c => c.kind !== 'attempt' && c.result.resource.resourceType === 'video').length;

  return (
    <Group
      data-upload-module
      data-upload-status
      justify="space-between"
      className={styles.module}
    >
      {hasActiveUploads ? (
        <Group justify="space-between" style={{ flex: 1 }}>
          <Group gap={4} align="center">
            <Loader size="xs" />
            <Text size="xs" c="dimmed">{uploadingCount} uploading</Text>
            {readyItems.length > 0 && (
              <Text size="xs" c="dimmed" style={{ opacity: 0.55 }}>· {readyItems.length} ready</Text>
            )}
          </Group>
          <Text size="xs" c="blue.4" fw={500} style={{ cursor: 'pointer' }} onClick={onOpen}>View</Text>
        </Group>
      ) : readyItems.length > 0 ? (
        <Group justify="space-between" style={{ flex: 1 }}>
          <Group gap={4} align="center">
            <ThemeIcon size={22} variant="transparent" style={{ color: 'var(--wa-accent-spot)' }}>
              <IconCheck size={20} />
            </ThemeIcon>
            {photoCount > 0 && (
              <Group gap={4} align="center">
                <ThemeIcon size={22} variant="transparent" className={styles.mediaIcon}>
                  <IconPhoto size={20} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">{photoCount}</Text>
              </Group>
            )}
            {videoCount > 0 && (
              <Group gap={4} align="center">
                <ThemeIcon size={22} variant="transparent" className={styles.mediaIcon}>
                  <IconVideo size={20} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">{videoCount}</Text>
              </Group>
            )}
          </Group>
          <Text size="xs" c="blue.4" fw={500} style={{ cursor: 'pointer' }} onClick={onOpen}>View</Text>
        </Group>
      ) : items.length > 0 ? (
        <Group justify="space-between" style={{ flex: 1 }}>
          <Text size="xs" c="red.4">Upload failed</Text>
          <Text size="xs" c="blue.4" fw={500} style={{ cursor: 'pointer' }} onClick={onOpen}>View</Text>
        </Group>
      ) : null}
    </Group>
  );
});

UploadStatusLabel.displayName = 'UploadStatusLabel';
