import { ActionIcon, Group, Menu, Stack, Text } from '@mantine/core';
import { IconCalendar, IconDots, IconMapPin, IconPencil, IconPhoto, IconTrash } from '@tabler/icons-react';
import { formatDateRange } from 'shared/lib/dateUtils';
import type { SurfSessionItem } from '../types';
import styles from './SurfSessionCard.module.css';

interface SurfSessionCardProps {
  session: SurfSessionItem;
  onClick?: (session: SurfSessionItem) => void;
  onEdit?: (session: SurfSessionItem) => void;
  onRemove?: (session: SurfSessionItem) => void;
}

export function SurfSessionCard({ session, onClick, onEdit, onRemove }: SurfSessionCardProps) {
  const hasActions = !!(onEdit || onRemove);

  return (
    <Stack gap={0} className={styles.card} onClick={onClick ? () => onClick(session) : undefined}>
      <div className={styles.media}>
        {session.thumbnailUrl ? (
          <img
            src={session.thumbnailUrl}
            alt={session.spot.name}
            className={styles.image}
          />
        ) : (
          <div className={styles.placeholder}>
            <IconPhoto size={28} className={styles.placeholderIcon} />
          </div>
        )}
        {hasActions && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="filled"
                color="dark"
                size="sm"
                radius="xl"
                className={styles.actionsTrigger}
                onClick={(e) => e.stopPropagation()}
                aria-label="Session actions"
              >
                <IconDots size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => onEdit(session)}>
                  Edit
                </Menu.Item>
              )}
              {onRemove && (
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => onRemove(session)}>
                  Remove completely
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>

      <Stack gap={4} p="xs">
        <Group gap={4} wrap="nowrap" justify="space-between">
          <Group gap={4} wrap="nowrap" className={styles.spotNameGroup}>
            <IconMapPin size={11} className={styles.metaIcon} />
            <Text size="xs" fw={600} truncate>{session.spot.name}</Text>
          </Group>
        </Group>

        <Group gap={4} wrap="nowrap">
          <IconCalendar size={11} className={styles.metaIconDimmed} />
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
            {formatDateRange(session.startsAt, session.endsAt)}
          </Text>
        </Group>

        <Text size="xs" c="dimmed">
          {session.mediaCount} item{session.mediaCount !== 1 ? 's' : ''}
        </Text>
      </Stack>
    </Stack>
  );
}
