import { Button, Group, Loader, Stack, TextInput } from '@mantine/core';
import styles from '../AddSpotPanel.module.css';

interface FormStepProps {
  name: string;
  location: string;
  nameError: string | null;
  locationError: string | null;
  isGeocoding: boolean;
  isSubmitting: boolean;
  onNameChange: (v: string) => void;
  onLocationChange: (v: string) => void;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

export function FormStep({
  name,
  location,
  nameError,
  locationError,
  isGeocoding,
  isSubmitting,
  onNameChange,
  onLocationChange,
  onBack,
  onCancel,
  onSubmit,
}: FormStepProps) {
  return (
    <Stack gap={8} className={styles.step}>
      <TextInput
        label="Spot name"
        placeholder="e.g. Uluwatu"
        value={name}
        onChange={(e) => onNameChange(e.currentTarget.value)}
        error={nameError}
        required
        autoFocus
        classNames={{ label: styles.fieldLabel, input: styles.textInput, error: styles.fieldError }}
      />
      <TextInput
        label="Location"
        placeholder="e.g. Bali, Indonesia"
        value={location}
        onChange={(e) => onLocationChange(e.currentTarget.value)}
        error={locationError}
        required
        rightSection={isGeocoding ? <Loader size={14} /> : null}
        classNames={{ label: styles.fieldLabel, input: styles.textInput, error: styles.fieldError }}
      />
      <Group justify="space-between" gap="sm" mt={4} wrap="nowrap" className={styles.actions}>
        <Group gap="xs">
          <Button variant="default" onClick={onBack} className={styles.controlButton}>Back</Button>
          <Button variant="default" onClick={onCancel} className={styles.controlButton}>Cancel</Button>
        </Group>
        <Button
          onClick={onSubmit}
          loading={isSubmitting}
          disabled={!name.trim() || !location.trim()}
          className={`${styles.controlButton} ${styles.primaryButton}`}
        >
          Add
        </Button>
      </Group>
    </Stack>
  );
}
