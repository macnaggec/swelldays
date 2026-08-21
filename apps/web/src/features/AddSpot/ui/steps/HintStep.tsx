import { Button, Group, Stack, Text } from '@mantine/core';
import { IconMapPin } from '@tabler/icons-react';
import styles from '../AddSpotPanel.module.css';

interface HintStepProps {
  onCancel: () => void;
}

export function HintStep({ onCancel }: HintStepProps) {
  return (
    <Stack gap={8} className={styles.step}>
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" className={styles.hintHeading}>
          <IconMapPin size={20} stroke={1.8} className={styles.hintIcon} />
          <Text fw={600} className={styles.hintTitle}>Click the globe to place a pin</Text>
        </Group>
        <Button variant="default" onClick={onCancel} className={styles.controlButton}>Cancel</Button>
      </Group>

      <Text size="sm" className={styles.hintCopy}>
        Drop a pin exactly where the surf spot is located.
      </Text>
    </Stack>
  );
}
