import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { Spot } from 'entities/Spot';
import styles from '../AddSpotPanel.module.css';

interface ProximityStepProps {
  nearbySpots: Spot[];
  isCreating: boolean;
  onGoToExisting: (spot: Spot) => void;
  onConfirmCreate: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export function ProximityStep({
  nearbySpots,
  isCreating,
  onGoToExisting,
  onConfirmCreate,
  onBack,
  onCancel,
}: ProximityStepProps) {
  return (
    <Stack gap={8} className={styles.step}>
      <Alert
        icon={<IconAlertTriangle size={16} />}
        color="yellow"
        title="Nearby spot found"
        p={6}
        className={styles.proximityAlert}
      >
        There's already a spot within 300 m. Is this the one you meant?
      </Alert>

      {nearbySpots.map((spot) => (
        <Group
          key={spot.id}
          justify="space-between"
          p={6}
          className={styles.nearbySpot}
        >
          <Stack gap={2}>
            <Text size="sm" fw={500}>{spot.name}</Text>
            <Text size="xs" c="dimmed">{spot.location}</Text>
          </Stack>
          <Button
            onClick={() => onGoToExisting(spot)}
            className={`${styles.controlButton} ${styles.primaryButton}`}
          >
            Go to this spot
          </Button>
        </Group>
      ))}

      <Group justify="space-between" mt={2}>
        <Group gap="xs">
          <Button variant="default" onClick={onBack} className={styles.controlButton}>Back</Button>
          <Button variant="default" onClick={onCancel} className={styles.controlButton}>Cancel</Button>
        </Group>
        <Button
          variant="subtle"
          color="gray"
          onClick={onConfirmCreate}
          loading={isCreating}
          className={styles.controlButton}
        >
          Create new
        </Button>
      </Group>
    </Stack>
  );
}
