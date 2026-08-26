import { Combobox, Text, Group } from '@mantine/core';
import { Spot } from 'entities/Spot';

interface SpotResultOptionProps {
  spot: Spot;
}

export function SpotResultOption({ spot }: SpotResultOptionProps) {
  return (
    <Combobox.Option value={spot.id}>
      <Group gap="xs">
        <Text size="sm" fw={500}>{spot.name}</Text>
        <Text size="xs" c="dimmed">{spot.location}</Text>
      </Group>
    </Combobox.Option>
  );
}
