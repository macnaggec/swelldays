import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { useRetireSurfSession } from '../model/usePublishedSession';
import type { SurfSessionItem } from '../types';

interface RemoveSessionModalProps {
  session: SurfSessionItem | null;
  onClose: () => void;
}

export function RemoveSessionModal({ session, onClose }: RemoveSessionModalProps) {
  const { mutateAsync: retireSession, isPending } = useRetireSurfSession();

  const handleConfirm = async () => {
    if (!session) return;
    try {
      await retireSession(session.id);
      notify.success('Session removed');
      onClose();
    } catch (error) {
      notify.error(getErrorMessage(error), 'Remove Failed');
    }
  };

  return (
    <Modal opened={!!session} onClose={onClose} title="Remove this session?" centered>
      <Stack gap="md">
        <Text size="sm">
          This takes the session out of the public gallery. Buyers who already purchased photos or
          videos from it keep access — only unsold media is removed from view.
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button color="red" onClick={() => { void handleConfirm(); }} loading={isPending}>
            Remove completely
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
